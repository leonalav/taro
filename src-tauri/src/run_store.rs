//! Durable foundation boundary records. No network, approvals, or workspace mutations occur here.
//!
//! Claim/release and persisted recovery-accounting semantics adapted from OpenCode
//! SessionStore / SessionExecution at fdce6365bcdf2af0fdac65d46dc1806a75d10b02.
//! Copyright (c) 2025 opencode, MIT; see THIRD_PARTY_NOTICES.md.
use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{path::Path, time::Duration};
pub type StoreResult<T> = Result<T, String>;
fn db(error: impl std::fmt::Display) -> String {
    format!("Foundation storage: {error}")
}
fn encode<T: Serialize>(value: &T) -> StoreResult<String> {
    serde_json::to_string(value).map_err(db)
}
fn decode<T: serde::de::DeserializeOwned>(value: &str) -> StoreResult<T> {
    serde_json::from_str(value).map_err(db)
}
fn valid_id(id: &str) -> StoreResult<()> {
    if id.trim().is_empty() || id.len() > 256 || id.contains('\0') {
        Err("Invalid foundation identity".into())
    } else {
        Ok(())
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Scope {
    pub workspace_root: String,
    pub session_id: String,
    pub run_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_run_id: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RunLimits {
    pub request_limit: u32,
    pub active_time_limit_ms: u64,
}
impl Default for RunLimits {
    fn default() -> Self {
        Self {
            request_limit: 128,
            active_time_limit_ms: 30 * 60 * 1000,
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum RunState {
    Active,
    Paused,
    Completed,
    Failed,
    Cancelled,
    Interrupted,
}
impl RunState {
    fn name(&self) -> &'static str {
        match self {
            Self::Active => "active",
            Self::Paused => "paused",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
            Self::Interrupted => "interrupted",
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RunRecord {
    pub scope: Scope,
    pub root_run_id: String,
    pub state: RunState,
    pub limits: RunLimits,
    pub requests_reserved: u32,
    pub context_epoch: u64,
    pub recovery_attempts: u32,
    pub metadata: Value,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ToolIntent {
    pub attempt_id: String,
    pub operation_id: String,
    pub tool: String,
    pub input: Value,
    pub side_effect: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ToolState {
    Intent,
    Started,
    Succeeded,
    Failed,
    Cancelled,
    Unknown,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ToolOutcome {
    pub state: ToolState,
    pub preview: String,
    pub output_ref: Option<String>,
}
impl ToolOutcome {
    pub fn succeeded(preview: &str) -> Self {
        Self {
            state: ToolState::Succeeded,
            preview: preview.into(),
            output_ref: None,
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ToolAttempt {
    pub intent: ToolIntent,
    pub state: ToolState,
    pub outcome: Option<ToolOutcome>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StoredExchange {
    pub id: String,
    pub sequence: u64,
    pub payload: Value,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StoredEvent {
    pub id: String,
    pub sequence: u64,
    pub kind: String,
    pub payload: Value,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ContextInput {
    pub source_sequence: u64,
    pub model: String,
    pub summary: Value,
    pub tail_start: u64,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ContextEpoch {
    pub epoch: u64,
    pub context: ContextInput,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Reservation {
    pub attempt_id: String,
    pub run_id: String,
    pub root_run_id: String,
    pub kind: String,
    pub ordinal: u32,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedRun {
    pub run: RunRecord,
    pub exchanges: Vec<StoredExchange>,
    pub attempts: Vec<ToolAttempt>,
    pub events: Vec<StoredEvent>,
    pub context: Option<ContextEpoch>,
}

pub struct RunStore {
    connection: Connection,
}
impl RunStore {
    pub fn open(path: &Path) -> StoreResult<Self> {
        let mut connection = Connection::open(path).map_err(db)?;
        connection
            .busy_timeout(Duration::from_secs(5))
            .map_err(db)?;
        connection
            .execute_batch("PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;")
            .map_err(db)?;
        let version: u32 = connection
            .pragma_query_value(None, "user_version", |r| r.get(0))
            .map_err(db)?;
        if version > 2 {
            return Err(format!("Unsupported foundation schema {version}"));
        }
        if version == 0 {
            let transaction = connection
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(db)?;
            let locked_version: u32 = transaction
                .pragma_query_value(None, "user_version", |r| r.get(0))
                .map_err(db)?;
            if locked_version == 0 {
                transaction
                    .execute_batch(include_str!("run_store/schema.sql"))
                    .map_err(db)?;
                transaction
                    .pragma_update(None, "user_version", 1)
                    .map_err(db)?;
            } else if locked_version > 2 {
                return Err("Unsupported foundation schema".into());
            }
            transaction.commit().map_err(db)?;
        }
        if version < 2 {
            let transaction = connection
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(db)?;
            let locked: u32 = transaction
                .pragma_query_value(None, "user_version", |r| r.get(0))
                .map_err(db)?;
            if locked < 2 {
                transaction.execute_batch("CREATE TABLE tool_outputs (id TEXT PRIMARY KEY NOT NULL,run_id TEXT NOT NULL REFERENCES runs(id),attempt_id TEXT NOT NULL REFERENCES tool_attempts(id),payload TEXT NOT NULL CHECK(json_valid(payload)),UNIQUE(run_id,attempt_id));").map_err(db)?;
                transaction
                    .pragma_update(None, "user_version", 2)
                    .map_err(db)?;
            }
            transaction.commit().map_err(db)?;
        }
        let check: String = connection
            .query_row("PRAGMA quick_check", [], |r| r.get(0))
            .map_err(db)?;
        if check != "ok" {
            return Err("Foundation database integrity check failed".into());
        }
        Ok(Self { connection })
    }
    fn transaction<T>(
        &mut self,
        work: impl FnOnce(&Transaction<'_>) -> StoreResult<T>,
    ) -> StoreResult<T> {
        let transaction = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(db)?;
        let result = work(&transaction)?;
        transaction.commit().map_err(db)?;
        Ok(result)
    }
    pub fn begin(&mut self, mut scope: Scope, limits: RunLimits) -> StoreResult<RunRecord> {
        valid_id(&scope.run_id)?;
        valid_id(&scope.session_id)?;
        let root = std::fs::canonicalize(&scope.workspace_root).map_err(db)?;
        if !root.is_dir() {
            return Err("Workspace must be a directory".into());
        }
        scope.workspace_root = root
            .to_str()
            .ok_or("Workspace path is not valid UTF-8")?
            .into();
        if limits.request_limit == 0
            || limits.request_limit > 1_000_000
            || limits.active_time_limit_ms == 0
        {
            return Err("Invalid run limits".into());
        }
        self.transaction(|tx|{
   if let Some(existing)=read_run(tx,&scope.run_id)? {
    if existing.scope!=scope||(scope.parent_run_id.is_none()&&existing.limits!=limits){return Err("Run identity already belongs to different scope or limits".into());}
    return Ok(existing);
   }
   let (root_run_id,effective_limits)=if let Some(parent)=&scope.parent_run_id{
    let parent=read_run(tx,parent)?.ok_or("Parent run missing")?;
    checked_run(tx,&parent.scope,true)?;
    if parent.scope.workspace_root!=scope.workspace_root||parent.state!=RunState::Active{return Err("Parent scope is unavailable or mismatched".into());}
    let root=read_run(tx,&parent.root_run_id)?.ok_or("Root run missing")?;
    if root.state!=RunState::Active{return Err("Root run is not active".into());}
    (parent.root_run_id,root.limits)
   }else{(scope.run_id.clone(),limits.clone())};
   tx.execute("INSERT INTO runs(id,scope,root_run_id,state,limits,metadata) VALUES(?1,?2,?3,'active',?4,'{}')",params![scope.run_id,encode(&scope)?,root_run_id,encode(&effective_limits)?]).map_err(db)?;
   append_event(tx,&scope,"run-started","begin",json!({"rootRunId":root_run_id}))?;
   read_run(tx,&scope.run_id)?.ok_or("Run disappeared".into())
  })
    }
    pub fn load(&self, scope: &Scope) -> StoreResult<LoadedRun> {
        // A read transaction gives exchanges/context/events a consistent snapshot even
        // when another SQLite connection commits a boundary concurrently.
        self.connection
            .execute_batch("BEGIN DEFERRED")
            .map_err(db)?;
        let result = (|| {
            let run = checked_run(&self.connection, scope, false)?;
            let mut statement = self
                .connection
                .prepare(
                    "SELECT id,sequence,payload FROM exchanges WHERE run_id=?1 ORDER BY sequence",
                )
                .map_err(db)?;
            let rows = statement
                .query_map([&scope.run_id], |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, u64>(1)?,
                        r.get::<_, String>(2)?,
                    ))
                })
                .map_err(db)?;
            let mut exchanges = Vec::new();
            for row in rows {
                let (id, sequence, payload) = row.map_err(db)?;
                exchanges.push(StoredExchange {
                    id,
                    sequence,
                    payload: decode(&payload)?,
                });
            }
            let mut statement = self
                .connection
                .prepare("SELECT record FROM tool_attempts WHERE run_id=?1 ORDER BY rowid")
                .map_err(db)?;
            let rows = statement
                .query_map([&scope.run_id], |r| r.get::<_, String>(0))
                .map_err(db)?;
            let mut attempts = Vec::new();
            for row in rows {
                attempts.push(decode(&row.map_err(db)?)?);
            }
            let mut statement = self
                .connection
                .prepare(
                    "SELECT id,sequence,kind,payload FROM events WHERE run_id=?1 ORDER BY sequence",
                )
                .map_err(db)?;
            let rows = statement
                .query_map([&scope.run_id], |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, u64>(1)?,
                        r.get::<_, String>(2)?,
                        r.get::<_, String>(3)?,
                    ))
                })
                .map_err(db)?;
            let mut events = Vec::new();
            for row in rows {
                let (id, sequence, kind, payload) = row.map_err(db)?;
                events.push(StoredEvent {
                    id,
                    sequence,
                    kind,
                    payload: decode(&payload)?,
                });
            }
            let context: Option<String> = self
                .connection
                .query_row(
                    "SELECT record FROM context_epochs WHERE run_id=?1 ORDER BY epoch DESC LIMIT 1",
                    [&scope.run_id],
                    |r| r.get(0),
                )
                .optional()
                .map_err(db)?;
            Ok(LoadedRun {
                run,
                exchanges,
                attempts,
                events,
                context: context.map(|s| decode(&s)).transpose()?,
            })
        })();
        let end = self.connection.execute_batch("ROLLBACK").map_err(db);
        match (result, end) {
            (Ok(value), Ok(())) => Ok(value),
            (Err(error), _) => Err(error),
            (_, Err(error)) => Err(error),
        }
    }
    pub fn append_exchange(&mut self, scope: &Scope, id: &str, payload: Value) -> StoreResult<u64> {
        valid_id(id)?;
        let serialized = encode(&payload)?;
        if serialized.len() > 16 * 1024 * 1024 {
            return Err(
                "Exchange exceeds durable storage boundary; persist large output separately".into(),
            );
        }
        self.transaction(|tx| {
            checked_run(tx, scope, true)?;
            let existing: Option<(String, u64, String)> = tx
                .query_row(
                    "SELECT run_id,sequence,payload FROM exchanges WHERE id=?1",
                    [id],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
                )
                .optional()
                .map_err(db)?;
            if let Some((run_id, seq, text)) = existing {
                if run_id == scope.run_id && text == serialized {
                    return Ok(seq);
                }
                return Err("Conflicting exchange identity".into());
            }
            let sequence = append_event(tx, scope, "model-exchange", id, json!({"exchangeId":id}))?;
            tx.execute(
                "INSERT INTO exchanges(id,run_id,sequence,payload) VALUES(?1,?2,?3,?4)",
                params![id, scope.run_id, sequence, serialized],
            )
            .map_err(db)?;
            Ok(sequence)
        })
    }
    pub fn record_intent(&mut self, scope: &Scope, intent: ToolIntent) -> StoreResult<ToolAttempt> {
        valid_id(&intent.attempt_id)?;
        valid_id(&intent.operation_id)?;
        valid_id(&intent.tool)?;
        if encode(&intent)?.len() > 1024 * 1024 {
            return Err("Tool intent exceeds 1 MiB storage boundary".into());
        }
        self.transaction(|tx|{
   checked_run(tx,scope,true)?;
   if let Some((owner,old))=read_attempt(tx,&intent.attempt_id)?{if owner==scope.run_id&&old.intent==intent{return Ok(old);}return Err("Conflicting attempt identity".into());}
   let record=ToolAttempt{intent,state:ToolState::Intent,outcome:None};
   tx.execute("INSERT INTO tool_attempts(id,run_id,record) VALUES(?1,?2,?3)",params![record.intent.attempt_id,scope.run_id,encode(&record)?]).map_err(db)?;
   append_event(tx,scope,"tool-intent",&record.intent.attempt_id,json!({"attemptId":record.intent.attempt_id,"operationId":record.intent.operation_id}))?;Ok(record)
  })
    }
    pub fn mark_started(&mut self, scope: &Scope, attempt_id: &str) -> StoreResult<ToolAttempt> {
        self.transaction(|tx| {
            checked_run(tx, scope, true)?;
            let (owner, mut attempt) =
                read_attempt(tx, attempt_id)?.ok_or("Tool intent missing")?;
            if owner != scope.run_id {
                return Err("Attempt belongs to another run".into());
            }
            if attempt.state != ToolState::Intent {
                return Err(
                    "Attempt already dispatched; inspect its outcome instead of replaying".into(),
                );
            }
            attempt.state = ToolState::Started;
            tx.execute(
                "UPDATE tool_attempts SET record=?2 WHERE id=?1",
                params![attempt_id, encode(&attempt)?],
            )
            .map_err(db)?;
            append_event(
                tx,
                scope,
                "tool-started",
                attempt_id,
                json!({"attemptId":attempt_id}),
            )?;
            Ok(attempt)
        })
    }
    pub fn persist_output(
        &mut self,
        scope: &Scope,
        attempt_id: &str,
        payload: Value,
    ) -> StoreResult<String> {
        let text = encode(&payload)?;
        self.transaction(|tx|{
            checked_run(tx,scope,false)?;
            let(owner,_)=read_attempt(tx,attempt_id)?.ok_or("Tool intent missing")?;
            if owner!=scope.run_id{return Err("Attempt belongs to another run".into());}
            let reference=format!("foundation-output:{:x}",Sha256::digest(encode(&(scope.run_id.as_str(),attempt_id))?.as_bytes()));
            let existing:Option<String>=tx.query_row("SELECT payload FROM tool_outputs WHERE id=?1",[&reference],|r|r.get(0)).optional().map_err(db)?;
            if let Some(existing)=existing{if existing==text{return Ok(reference);}return Err("Full output already exists with different contents; inspect instead of replaying".into());}
            tx.execute("INSERT INTO tool_outputs(id,run_id,attempt_id,payload) VALUES(?1,?2,?3,?4)",params![reference,scope.run_id,attempt_id,text]).map_err(db)?;
            append_event(tx,scope,"tool-output-saved",attempt_id,json!({"attemptId":attempt_id,"outputRef":reference}))?;
            Ok(reference)
        })
    }
    pub fn read_output(&self, scope: &Scope, reference: &str) -> StoreResult<Value> {
        checked_run(&self.connection, scope, false)?;
        let text: String = self
            .connection
            .query_row(
                "SELECT payload FROM tool_outputs WHERE id=?1 AND run_id=?2",
                params![reference, scope.run_id],
                |r| r.get(0),
            )
            .map_err(db)?;
        decode(&text)
    }
    pub fn record_outcome(
        &mut self,
        scope: &Scope,
        attempt_id: &str,
        outcome: ToolOutcome,
    ) -> StoreResult<ToolAttempt> {
        if matches!(outcome.state, ToolState::Intent | ToolState::Started) {
            return Err("A tool outcome must be terminal or unknown".into());
        }
        if outcome.preview.len() > 16 * 1024 {
            return Err(
                "Tool preview exceeds 16 KiB; retain full output in a durable output reference"
                    .into(),
            );
        }
        self.transaction(|tx|{
   checked_run(tx,scope,false)?;
   let(owner,mut attempt)=read_attempt(tx,attempt_id)?.ok_or("Tool intent missing")?;
   if owner!=scope.run_id{return Err("Attempt belongs to another run".into());}
   if let Some(reference)=&outcome.output_ref {
    let valid:u64=tx.query_row("SELECT count(*) FROM tool_outputs WHERE id=?1 AND run_id=?2 AND attempt_id=?3",params![reference,scope.run_id,attempt_id],|r|r.get(0)).map_err(db)?;
    if valid!=1{return Err("Output reference is missing or outside the attempt scope".into());}
   }
   if let Some(old)=&attempt.outcome{if old==&outcome{return Ok(attempt);}return Err("Settled/unknown outcomes require explicit reconciliation, never overwrite".into());}
   if outcome.state==ToolState::Succeeded && (attempt.state!=ToolState::Started || outcome.output_ref.is_none()) {
    return Err("Successful outcomes require a dispatched attempt and its retained full result".into());
   }
   attempt.state=outcome.state.clone();attempt.outcome=Some(outcome);
   tx.execute("UPDATE tool_attempts SET record=?2 WHERE id=?1",params![attempt_id,encode(&attempt)?]).map_err(db)?;
   if attempt.state==ToolState::Unknown{tx.execute("UPDATE runs SET state='paused' WHERE id=?1 OR id=(SELECT root_run_id FROM runs WHERE id=?1)",[&scope.run_id]).map_err(db)?;}
   append_event(tx,scope,"tool-outcome",attempt_id,json!({"attemptId":attempt_id,"state":attempt.state}))?;Ok(attempt)
  })
    }
    pub fn reserve_request(
        &mut self,
        scope: &Scope,
        attempt_id: &str,
        kind: &str,
    ) -> StoreResult<Reservation> {
        valid_id(attempt_id)?;
        if !["model", "child", "summary"].contains(&kind) {
            return Err("Invalid reservation kind".into());
        }
        self.transaction(|tx|{
   let run=checked_run(tx,scope,true)?;
   let existing:Option<String>=tx.query_row("SELECT record FROM request_reservations WHERE id=?1",[attempt_id],|r|r.get(0)).optional().map_err(db)?;
   if let Some(text)=existing{let r:Reservation=decode(&text)?;if r.run_id==scope.run_id&&r.kind==kind{return Ok(r);}return Err("Reservation identity belongs to another request".into());}
   let root=read_run(tx,&run.root_run_id)?.ok_or("Root run missing")?;
   if root.state!=RunState::Active{return Err("Root run is not active".into());}
   let changed=tx.execute("UPDATE runs SET requests_reserved=requests_reserved+1 WHERE id=?1 AND requests_reserved<?2",params![root.scope.run_id,root.limits.request_limit]).map_err(db)?;
   if changed!=1{return Err("Request allowance exhausted; only a user continuation can grant more".into());}
   let ordinal:u32=tx.query_row("SELECT requests_reserved FROM runs WHERE id=?1",[&root.scope.run_id],|r|r.get(0)).map_err(db)?;
   let reservation=Reservation{attempt_id:attempt_id.into(),run_id:scope.run_id.clone(),root_run_id:root.scope.run_id,kind:kind.into(),ordinal};
   tx.execute("INSERT INTO request_reservations(id,run_id,record) VALUES(?1,?2,?3)",params![attempt_id,scope.run_id,encode(&reservation)?]).map_err(db)?;
   append_event(tx,scope,"request-reserved",attempt_id,json!({"attemptId":attempt_id,"ordinal":ordinal,"kind":kind}))?;Ok(reservation)
  })
    }
    pub fn save_context(
        &mut self,
        scope: &Scope,
        expected_epoch: u64,
        context: ContextInput,
    ) -> StoreResult<ContextEpoch> {
        valid_id(&context.model)?;
        let objective = context
            .summary
            .as_object()
            .and_then(|o| o.get("objective"))
            .and_then(Value::as_str);
        if !objective.is_some_and(|text| !text.trim().is_empty()) {
            return Err("A structured summary with a nonempty objective is required".into());
        }
        self.transaction(|tx| {
            let run = checked_run(tx, scope, true)?;
            if run.context_epoch != expected_epoch {
                return Err("Context epoch changed; preserve the newer context".into());
            }
            let latest: u64 = tx
                .query_row(
                    "SELECT coalesce(max(sequence),0) FROM exchanges WHERE run_id=?1",
                    [&scope.run_id],
                    |r| r.get(0),
                )
                .map_err(db)?;
            if context.source_sequence == 0
                || context.source_sequence > latest
                || context.tail_start > context.source_sequence
            {
                return Err("Invalid context coverage".into());
            }
            let source_exists: u64 = tx
                .query_row(
                    "SELECT count(*) FROM exchanges WHERE run_id=?1 AND sequence=?2",
                    params![scope.run_id, context.source_sequence],
                    |r| r.get(0),
                )
                .map_err(db)?;
            let tail_exists: u64 = if context.tail_start == 0 {
                1
            } else {
                tx.query_row(
                    "SELECT count(*) FROM exchanges WHERE run_id=?1 AND sequence=?2",
                    params![scope.run_id, context.tail_start],
                    |r| r.get(0),
                )
                .map_err(db)?
            };
            if source_exists != 1 || tail_exists != 1 {
                return Err("Context coverage must identify actual exchange boundaries".into());
            }
            let record = ContextEpoch {
                epoch: expected_epoch
                    .checked_add(1)
                    .ok_or("Context epoch overflow")?,
                context,
            };
            tx.execute(
                "INSERT INTO context_epochs(run_id,epoch,record) VALUES(?1,?2,?3)",
                params![scope.run_id, record.epoch, encode(&record)?],
            )
            .map_err(db)?;
            tx.execute(
                "UPDATE runs SET context_epoch=?2 WHERE id=?1",
                params![scope.run_id, record.epoch],
            )
            .map_err(db)?;
            append_event(
                tx,
                scope,
                "context-saved",
                &record.epoch.to_string(),
                json!({"epoch":record.epoch,"sourceSequence":record.context.source_sequence}),
            )?;
            Ok(record)
        })
    }
    pub fn save_metadata(&mut self, scope: &Scope, metadata: Value) -> StoreResult<RunRecord> {
        if encode(&metadata)?.len() > 128 * 1024 {
            return Err("Operational metadata exceeds 128 KiB".into());
        }
        self.transaction(|tx| {
            checked_run(tx, scope, true)?;
            tx.execute(
                "UPDATE runs SET metadata=?2 WHERE id=?1",
                params![scope.run_id, encode(&metadata)?],
            )
            .map_err(db)?;
            append_event(tx, scope, "metadata-saved", "metadata", json!({}))?;
            read_run(tx, &scope.run_id)?.ok_or("Run missing".into())
        })
    }
    pub fn finish(&mut self, scope: &Scope, state: RunState) -> StoreResult<RunRecord> {
        if state == RunState::Active {
            return Err("Finish requires a terminal or paused state".into());
        }
        self.transaction(|tx|{
   let run=checked_run(tx,scope,false)?;
   if run.state==state{return Ok(run);}
   if !matches!(run.state,RunState::Active|RunState::Paused){return Err("Run is already terminal".into());}
   if state==RunState::Completed {
    let pending:u64=tx.query_row("WITH RECURSIVE descendants(id) AS (SELECT ?1 UNION ALL SELECT r.id FROM runs r JOIN descendants d ON json_extract(r.scope,'$.parentRunId')=d.id) SELECT count(*) FROM tool_attempts WHERE run_id IN descendants AND json_extract(record,'$.state') IN ('intent','started','unknown')",[&scope.run_id],|r|r.get(0)).map_err(db)?;
    if pending>0{return Err("Unresolved tool attempts prevent a successful finish".into());}
    let children:u64=tx.query_row("WITH RECURSIVE descendants(id) AS (SELECT ?1 UNION ALL SELECT r.id FROM runs r JOIN descendants d ON json_extract(r.scope,'$.parentRunId')=d.id) SELECT count(*) FROM runs WHERE id IN descendants AND id!=?1 AND state IN ('active','paused','interrupted')",[&scope.run_id],|r|r.get(0)).map_err(db)?;
    if children>0{return Err("Active or unresolved children prevent a successful finish".into());}
   }
   tx.execute("UPDATE runs SET state=?2 WHERE id=?1",params![scope.run_id,state.name()]).map_err(db)?;
   append_event(tx,scope,"run-finished",state.name(),json!({"state":state}))?;
   read_run(tx,&scope.run_id)?.ok_or("Run missing".into())
  })
    }
    /// A claim is a recovery candidate, not permission to replay side effects.
    pub fn list_claimed(&self) -> StoreResult<Vec<RunRecord>> {
        let mut statement=self.connection.prepare("SELECT root.id FROM runs root WHERE json_extract(root.scope,'$.parentRunId') IS NULL AND (
            root.state IN ('active','paused','interrupted') OR
            EXISTS(SELECT 1 FROM tool_attempts a JOIN runs owner ON owner.id=a.run_id WHERE owner.root_run_id=root.id AND json_extract(a.record,'$.state') IN ('intent','started','unknown')) OR
            EXISTS(SELECT 1 FROM runs child WHERE child.root_run_id=root.id AND child.id!=root.id AND child.state IN ('active','paused','interrupted'))
        ) ORDER BY root.rowid").map_err(db)?;
        let ids = statement
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(db)?;
        let mut result = Vec::new();
        for id in ids {
            result.push(read_run(&self.connection, &id.map_err(db)?)?.ok_or("Run missing")?);
        }
        Ok(result)
    }
}
fn read_run(connection: &Connection, id: &str) -> StoreResult<Option<RunRecord>> {
    let row=connection.query_row("SELECT scope,root_run_id,state,limits,requests_reserved,context_epoch,recovery_attempts,metadata FROM runs WHERE id=?1",[id],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,String>(3)?,r.get::<_,u32>(4)?,r.get::<_,u64>(5)?,r.get::<_,u32>(6)?,r.get::<_,String>(7)?))).optional().map_err(db)?;
    row.map(
        |(
            scope,
            root_run_id,
            state,
            limits,
            requests_reserved,
            context_epoch,
            recovery_attempts,
            metadata,
        )| {
            Ok(RunRecord {
                scope: decode(&scope)?,
                root_run_id,
                state: serde_json::from_value(json!(state)).map_err(db)?,
                limits: decode(&limits)?,
                requests_reserved,
                context_epoch,
                recovery_attempts,
                metadata: decode(&metadata)?,
            })
        },
    )
    .transpose()
}
fn checked_run(connection: &Connection, scope: &Scope, active: bool) -> StoreResult<RunRecord> {
    let run = read_run(connection, &scope.run_id)?.ok_or("Run not found")?;
    if run.scope != *scope {
        return Err("Foundation scope mismatch".into());
    }
    if active && run.state != RunState::Active {
        return Err("Run is paused or terminal; no new dispatch is allowed".into());
    }
    if active {
        let mut parent_id = run.scope.parent_run_id.clone();
        let mut visited = std::collections::HashSet::from([run.scope.run_id.clone()]);
        let mut last_id = run.scope.run_id.clone();
        while let Some(id) = parent_id {
            if !visited.insert(id.clone()) || visited.len() > 128 {
                return Err("Invalid foundation ancestry".into());
            }
            let parent = read_run(connection, &id)?.ok_or("Ancestor run missing")?;
            if parent.state != RunState::Active || parent.root_run_id != run.root_run_id {
                return Err("Ancestor run is paused, terminal, or mismatched; descendant dispatch is blocked".into());
            }
            last_id = parent.scope.run_id.clone();
            parent_id = parent.scope.parent_run_id;
        }
        if last_id != run.root_run_id {
            return Err("Root run identity does not match ancestry".into());
        }
    }
    Ok(run)
}
fn read_attempt(connection: &Connection, id: &str) -> StoreResult<Option<(String, ToolAttempt)>> {
    let row: Option<(String, String)> = connection
        .query_row(
            "SELECT run_id,record FROM tool_attempts WHERE id=?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(db)?;
    row.map(|(owner, text)| Ok((owner, decode(&text)?)))
        .transpose()
}
fn append_event(
    transaction: &Transaction<'_>,
    scope: &Scope,
    kind: &str,
    key: &str,
    payload: Value,
) -> StoreResult<u64> {
    let sequence: u64 = transaction
        .query_row(
            "UPDATE runs SET sequence=sequence+1 WHERE id=?1 RETURNING sequence",
            [&scope.run_id],
            |r| r.get(0),
        )
        .map_err(db)?;
    let identity = encode(&(scope.run_id.as_str(), kind, key, sequence))?;
    let id = format!("{:x}", Sha256::digest(identity.as_bytes()));
    transaction
        .execute(
            "INSERT INTO events(id,run_id,sequence,kind,payload) VALUES(?1,?2,?3,?4,?5)",
            params![id, scope.run_id, sequence, kind, encode(&payload)?],
        )
        .map_err(db)?;
    Ok(sequence)
}
#[cfg(test)]
mod tests;
