use super::*;
use serde_json::json;
use tempfile::TempDir;
fn scope(dir: &TempDir, id: &str) -> Scope {
    Scope {
        workspace_root: dir.path().to_string_lossy().into(),
        session_id: format!("session-{id}"),
        run_id: id.into(),
        parent_run_id: None,
    }
}
fn begin(store: &mut RunStore, dir: &TempDir, id: &str) -> Scope {
    store
        .begin(scope(dir, id), RunLimits::default())
        .unwrap()
        .scope
}
fn intent(id: &str) -> ToolIntent {
    ToolIntent {
        attempt_id: id.into(),
        operation_id: format!("op-{id}"),
        tool: "Write".into(),
        input: json!({"file_path":"a.txt","content":"new"}),
        side_effect: true,
    }
}
#[test]
fn run_store_reopens_transcripts_intents_and_ordered_events() {
    let dir = TempDir::new().unwrap();
    let db = dir.path().join("foundation.sqlite");
    let scope = {
        let mut store = RunStore::open(&db).unwrap();
        let s = begin(&mut store, &dir, "root");
        store
            .append_exchange(
                &s,
                "user-1",
                json!({"role":"user","content":"keep every byte"}),
            )
            .unwrap();
        store.record_intent(&s, intent("attempt")).unwrap();
        s
    };
    let store = RunStore::open(&db).unwrap();
    let loaded = store.load(&scope).unwrap();
    assert_eq!(loaded.exchanges.len(), 1);
    assert_eq!(loaded.attempts[0].state, ToolState::Intent);
    assert!(loaded
        .events
        .windows(2)
        .all(|w| w[0].sequence < w[1].sequence));
    assert_eq!(loaded.exchanges[0].payload["content"], "keep every byte");
}
#[test]
fn run_store_deduplicates_matching_ids_and_rejects_conflicting_payloads() {
    let dir = TempDir::new().unwrap();
    let mut store = RunStore::open(&dir.path().join("db")).unwrap();
    let s = begin(&mut store, &dir, "root");
    let first = store
        .append_exchange(&s, "x", json!({"role":"user","content":"first"}))
        .unwrap();
    assert_eq!(
        first,
        store
            .append_exchange(&s, "x", json!({"role":"user","content":"first"}))
            .unwrap()
    );
    assert!(store
        .append_exchange(&s, "x", json!({"role":"user","content":"changed"}))
        .is_err());
    store.record_intent(&s, intent("tool")).unwrap();
    store.record_intent(&s, intent("tool")).unwrap();
    let mut changed = intent("tool");
    changed.input = json!({"different":true});
    assert!(store.record_intent(&s, changed).is_err());
    assert_eq!(store.load(&s).unwrap().attempts.len(), 1);
}
#[test]
fn run_store_scope_and_parent_boundaries_are_checked() {
    let dir = TempDir::new().unwrap();
    let mut store = RunStore::open(&dir.path().join("db")).unwrap();
    let s = begin(&mut store, &dir, "root");
    let mut wrong = s.clone();
    wrong.session_id = "other".into();
    assert!(store.load(&wrong).is_err());
    wrong = s.clone();
    wrong.workspace_root = "/".into();
    assert!(store.record_intent(&wrong, intent("bad")).is_err());
    let mut child = scope(&dir, "child");
    child.parent_run_id = Some(s.run_id.clone());
    let c = store.begin(child, RunLimits::default()).unwrap();
    assert_eq!(c.root_run_id, s.run_id);
    assert!(store
        .record_outcome(&c.scope, "bad", ToolOutcome::succeeded("done"))
        .is_err());
    let outside = TempDir::new().unwrap();
    let mut child = scope(&outside, "escape");
    child.parent_run_id = Some(s.run_id);
    assert!(store.begin(child, RunLimits::default()).is_err());
}
#[test]
fn run_store_rolls_back_intent_when_event_insert_fails() {
    let dir = TempDir::new().unwrap();
    let mut store = RunStore::open(&dir.path().join("db")).unwrap();
    let s = begin(&mut store, &dir, "root");
    store.connection.execute_batch("CREATE TRIGGER fail_events BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT,'simulated disk failure'); END;").unwrap();
    assert!(store.record_intent(&s, intent("not-durable")).is_err());
    assert!(store.load(&s).unwrap().attempts.is_empty());
}
#[test]
fn run_store_readonly_disk_failure_blocks_progress() {
    let dir = TempDir::new().unwrap();
    let mut store = RunStore::open(&dir.path().join("db")).unwrap();
    let s = begin(&mut store, &dir, "root");
    store
        .connection
        .execute_batch("PRAGMA query_only=ON")
        .unwrap();
    assert!(store
        .append_exchange(&s, "not-saved", json!({"role":"user"}))
        .is_err());
    assert!(store.record_intent(&s, intent("not-started")).is_err());
    assert!(store.load(&s).unwrap().attempts.is_empty());
}
#[test]
fn run_store_rejects_future_schema_and_corrupt_database() {
    let dir = TempDir::new().unwrap();
    let db = dir.path().join("db");
    let c = rusqlite::Connection::open(&db).unwrap();
    c.pragma_update(None, "user_version", 999).unwrap();
    drop(c);
    assert!(RunStore::open(&db).is_err());
    std::fs::write(&db, b"not sqlite").unwrap();
    assert!(RunStore::open(&db).is_err());
}
#[test]
fn run_store_never_rewrites_unknown_or_completed_outcomes() {
    let dir = TempDir::new().unwrap();
    let mut store = RunStore::open(&dir.path().join("db")).unwrap();
    let s = begin(&mut store, &dir, "root");
    store.record_intent(&s, intent("a")).unwrap();
    store
        .record_outcome(
            &s,
            "a",
            ToolOutcome {
                state: ToolState::Unknown,
                preview: "process exited before durable result".into(),
                output_ref: None,
            },
        )
        .unwrap();
    assert!(store
        .record_outcome(&s, "a", ToolOutcome::succeeded("invented success"))
        .is_err());
    assert!(store.finish(&s, RunState::Completed).is_err());
    assert_eq!(
        store.load(&s).unwrap().attempts[0].state,
        ToolState::Unknown
    );
}
#[test]
fn run_store_context_epochs_compare_and_swap_and_preserve_transcripts() {
    let dir = TempDir::new().unwrap();
    let mut store = RunStore::open(&dir.path().join("db")).unwrap();
    let s = begin(&mut store, &dir, "root");
    let seq = store
        .append_exchange(&s, "u", json!({"role":"user","content":"original"}))
        .unwrap();
    let context = ContextInput {
        source_sequence: seq,
        model: "test-model".into(),
        summary: json!({"objective":"keep original"}),
        tail_start: seq,
    };
    assert_eq!(store.save_context(&s, 0, context.clone()).unwrap().epoch, 1);
    assert!(store.save_context(&s, 0, context).is_err());
    assert_eq!(store.load(&s).unwrap().exchanges.len(), 1);
}
#[test]
fn run_store_reserves_root_allowance_atomically_across_children() {
    let dir = TempDir::new().unwrap();
    let db = dir.path().join("db");
    let mut store = RunStore::open(&db).unwrap();
    let s = store
        .begin(
            scope(&dir, "root"),
            RunLimits {
                request_limit: 1,
                ..RunLimits::default()
            },
        )
        .unwrap()
        .scope;
    let mut child = scope(&dir, "child");
    child.parent_run_id = Some(s.run_id.clone());
    let c = store.begin(child, RunLimits::default()).unwrap().scope;
    let reservation = store.reserve_request(&c, "request", "model").unwrap();
    assert_eq!(
        reservation,
        store.reserve_request(&c, "request", "model").unwrap()
    );
    let mut second = RunStore::open(&db).unwrap();
    assert!(second.reserve_request(&s, "second", "summary").is_err());
    assert_eq!(second.load(&s).unwrap().run.requests_reserved, 1);
}
#[test]
fn run_store_terminal_claim_is_not_recoverable() {
    let dir = TempDir::new().unwrap();
    let mut store = RunStore::open(&dir.path().join("db")).unwrap();
    let s = begin(&mut store, &dir, "root");
    assert_eq!(store.list_claimed().unwrap().len(), 1);
    store.finish(&s, RunState::Completed).unwrap();
    assert!(store.list_claimed().unwrap().is_empty());
    assert!(store.record_intent(&s, intent("after-finish")).is_err());
}
#[test]
fn run_store_racing_children_cannot_both_take_the_last_request() {
    let dir = TempDir::new().unwrap();
    let db = dir.path().join("db");
    let mut store = RunStore::open(&db).unwrap();
    let parent = store
        .begin(
            scope(&dir, "root"),
            RunLimits {
                request_limit: 1,
                ..RunLimits::default()
            },
        )
        .unwrap()
        .scope;
    let children: Vec<_> = (0..2)
        .map(|i| {
            let mut s = scope(&dir, &format!("child-{i}"));
            s.parent_run_id = Some(parent.run_id.clone());
            store.begin(s, RunLimits::default()).unwrap().scope
        })
        .collect();
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
    let threads: Vec<_> = children
        .into_iter()
        .enumerate()
        .map(|(i, s)| {
            let db = db.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                let mut store = RunStore::open(&db).unwrap();
                barrier.wait();
                store
                    .reserve_request(&s, &format!("request-{i}"), "child")
                    .is_ok()
            })
        })
        .collect();
    let count = threads
        .into_iter()
        .filter_map(|t| t.join().ok())
        .filter(|ok| *ok)
        .count();
    assert_eq!(count, 1);
    assert_eq!(store.load(&parent).unwrap().run.requests_reserved, 1);
}
#[test]
fn run_store_started_attempt_cannot_be_dispatched_twice() {
    let dir = TempDir::new().unwrap();
    let db = dir.path().join("db");
    let mut store = RunStore::open(&db).unwrap();
    let s = begin(&mut store, &dir, "root");
    store.record_intent(&s, intent("a")).unwrap();
    store.mark_started(&s, "a").unwrap();
    drop(store);
    let mut store = RunStore::open(&db).unwrap();
    assert!(store.mark_started(&s, "a").is_err());
    assert_eq!(
        store.load(&s).unwrap().attempts[0].state,
        ToolState::Started
    );
}
#[test]
fn run_store_child_begin_is_idempotent_with_root_owned_limits() {
    let dir = TempDir::new().unwrap();
    let mut store = RunStore::open(&dir.path().join("db")).unwrap();
    let root = store
        .begin(
            scope(&dir, "root"),
            RunLimits {
                request_limit: 2,
                ..RunLimits::default()
            },
        )
        .unwrap();
    let mut s = scope(&dir, "child");
    s.parent_run_id = Some(root.scope.run_id);
    let child = store.begin(s.clone(), RunLimits::default()).unwrap();
    assert_eq!(store.begin(s, RunLimits::default()).unwrap(), child);
}
#[test]
fn run_store_native_contract_roundtrips_frontend_fixture() {
    let fixture: serde_json::Value =
        serde_json::from_str(include_str!("../../../src/data/foundation-wire.json")).unwrap();
    macro_rules! roundtrip {
        ($name:literal,$type:ty) => {
            assert_eq!(
                serde_json::to_value(
                    serde_json::from_value::<$type>(fixture[$name].clone()).unwrap()
                )
                .unwrap(),
                fixture[$name]
            );
        };
    }
    roundtrip!("scope", Scope);
    roundtrip!("limits", RunLimits);
    roundtrip!("intent", ToolIntent);
    roundtrip!("outcome", ToolOutcome);
    roundtrip!("context", ContextInput);
}
#[test]
fn run_store_child_completion_does_not_depend_on_sibling_attempts() {
    let dir = TempDir::new().unwrap();
    let mut store = RunStore::open(&dir.path().join("db")).unwrap();
    let parent = begin(&mut store, &dir, "root");
    let mut first = scope(&dir, "first");
    first.parent_run_id = Some(parent.run_id.clone());
    let first = store.begin(first, RunLimits::default()).unwrap().scope;
    let mut second = scope(&dir, "second");
    second.parent_run_id = Some(parent.run_id);
    let second = store.begin(second, RunLimits::default()).unwrap().scope;
    store
        .record_intent(&second, intent("sibling-pending"))
        .unwrap();
    assert!(store.finish(&first, RunState::Completed).is_ok());
}
#[test]
fn run_store_root_cannot_claim_completion_while_a_child_is_active() {
    let dir = TempDir::new().unwrap();
    let mut store = RunStore::open(&dir.path().join("db")).unwrap();
    let parent = begin(&mut store, &dir, "root");
    let mut child = scope(&dir, "child");
    child.parent_run_id = Some(parent.run_id.clone());
    store.begin(child, RunLimits::default()).unwrap();
    assert!(store.finish(&parent, RunState::Completed).is_err());
}
#[test]
fn run_store_retains_full_outputs_and_guards_output_references() {
    let dir = TempDir::new().unwrap();
    let db = dir.path().join("db");
    let mut store = RunStore::open(&db).unwrap();
    let s = begin(&mut store, &dir, "root");
    store.record_intent(&s, intent("a")).unwrap();
    store.mark_started(&s, "a").unwrap();
    let original = json!({"text":"full result ".repeat(10000),"artifact":{"kind":"terminal"}});
    let reference = store.persist_output(&s, "a", original.clone()).unwrap();
    drop(store);
    let mut store = RunStore::open(&db).unwrap();
    assert_eq!(store.read_output(&s, &reference).unwrap(), original);
    let wrong = begin(&mut store, &dir, "other");
    assert!(store.read_output(&wrong, &reference).is_err());
    assert!(store
        .record_outcome(
            &s,
            "a",
            ToolOutcome {
                state: ToolState::Succeeded,
                preview: "done".into(),
                output_ref: Some("fake-output".into())
            }
        )
        .is_err());
    assert!(store
        .record_outcome(
            &s,
            "a",
            ToolOutcome {
                state: ToolState::Succeeded,
                preview: "done".into(),
                output_ref: Some(reference)
            }
        )
        .is_ok());
}
#[test]
fn run_store_does_not_claim_success_before_dispatch_or_without_a_retained_result() {
    let dir = TempDir::new().unwrap();
    let mut store = RunStore::open(&dir.path().join("db")).unwrap();
    let s = begin(&mut store, &dir, "root");
    store.record_intent(&s, intent("a")).unwrap();
    let reference = store
        .persist_output(&s, "a", json!({"text":"not dispatched"}))
        .unwrap();
    assert!(store
        .record_outcome(
            &s,
            "a",
            ToolOutcome {
                state: ToolState::Succeeded,
                preview: "pretend".into(),
                output_ref: Some(reference)
            }
        )
        .is_err());
    store.mark_started(&s, "a").unwrap();
    assert!(store
        .record_outcome(&s, "a", ToolOutcome::succeeded("missing full result"))
        .is_err());
}
#[test]
fn run_store_unknown_root_outcome_blocks_new_child_mutations() {
    let dir = TempDir::new().unwrap();
    let mut store = RunStore::open(&dir.path().join("db")).unwrap();
    let root = begin(&mut store, &dir, "root");
    let mut child = scope(&dir, "child");
    child.parent_run_id = Some(root.run_id.clone());
    let child = store.begin(child, RunLimits::default()).unwrap().scope;
    store.record_intent(&root, intent("root-tool")).unwrap();
    store
        .record_outcome(
            &root,
            "root-tool",
            ToolOutcome {
                state: ToolState::Unknown,
                preview: "uncertain".into(),
                output_ref: None,
            },
        )
        .unwrap();
    assert!(store.record_intent(&child, intent("child-write")).is_err());
}
#[test]
fn run_store_migrates_v1_without_replacing_existing_transcripts() {
    let dir = TempDir::new().unwrap();
    let db = dir.path().join("db");
    let mut store = RunStore::open(&db).unwrap();
    let s = begin(&mut store, &dir, "root");
    store
        .append_exchange(&s, "preserved", json!({"role":"user","content":"original"}))
        .unwrap();
    store
        .connection
        .execute_batch("DROP TABLE tool_outputs; PRAGMA user_version=1;")
        .unwrap();
    drop(store);
    let store = RunStore::open(&db).unwrap();
    assert_eq!(
        store.load(&s).unwrap().exchanges[0].payload["content"],
        "original"
    );
    let version: u32 = store
        .connection
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .unwrap();
    assert_eq!(version, 2);
}
#[test]
fn run_store_cancelled_or_failed_roots_keep_uncertain_work_discoverable() {
    for terminal in [RunState::Cancelled, RunState::Failed] {
        let dir = TempDir::new().unwrap();
        let mut store = RunStore::open(&dir.path().join("db")).unwrap();
        let root = begin(&mut store, &dir, "root");
        store.record_intent(&root, intent("a")).unwrap();
        store.mark_started(&root, "a").unwrap();
        store.finish(&root, terminal).unwrap();
        assert_eq!(store.list_claimed().unwrap().len(), 1);
        assert_eq!(
            store.load(&root).unwrap().attempts[0].state,
            ToolState::Started
        );
    }
}
#[test]
fn run_store_terminal_root_with_active_child_remains_discoverable() {
    let dir = TempDir::new().unwrap();
    let mut store = RunStore::open(&dir.path().join("db")).unwrap();
    let root = begin(&mut store, &dir, "root");
    let mut child = scope(&dir, "child");
    child.parent_run_id = Some(root.run_id.clone());
    store.begin(child, RunLimits::default()).unwrap();
    store.finish(&root, RunState::Cancelled).unwrap();
    assert_eq!(store.list_claimed().unwrap().len(), 1);
}
#[test]
fn run_store_every_ancestor_controls_new_dispatch_and_child_creation() {
    for terminal in [RunState::Paused, RunState::Cancelled] {
        let dir = TempDir::new().unwrap();
        let mut store = RunStore::open(&dir.path().join("db")).unwrap();
        let root = begin(&mut store, &dir, "root");
        let mut parent = scope(&dir, "parent");
        parent.parent_run_id = Some(root.run_id);
        let parent = store.begin(parent, RunLimits::default()).unwrap().scope;
        let mut child = scope(&dir, "child");
        child.parent_run_id = Some(parent.run_id.clone());
        let child = store.begin(child, RunLimits::default()).unwrap().scope;
        store.record_intent(&child, intent("waiting")).unwrap();
        store.finish(&parent, terminal).unwrap();
        assert!(store.reserve_request(&child, "request", "child").is_err());
        assert!(store.record_intent(&child, intent("new-write")).is_err());
        assert!(store.mark_started(&child, "waiting").is_err());
        let mut nested = scope(&dir, "nested");
        nested.parent_run_id = Some(child.run_id);
        assert!(store.begin(nested, RunLimits::default()).is_err());
    }
}
#[test]
fn run_store_context_requires_a_summary_and_actual_exchange_boundaries() {
    let dir = TempDir::new().unwrap();
    let mut store = RunStore::open(&dir.path().join("db")).unwrap();
    let s = begin(&mut store, &dir, "root");
    let seq = store
        .append_exchange(&s, "u", json!({"role":"user","content":"preserved"}))
        .unwrap();
    let valid = ContextInput {
        source_sequence: seq,
        tail_start: seq,
        model: "model".into(),
        summary: json!({"objective":"preserve objective"}),
    };
    assert!(store
        .save_context(
            &s,
            0,
            ContextInput {
                source_sequence: 1,
                tail_start: 0,
                ..valid.clone()
            }
        )
        .is_err());
    for summary in [
        json!([]),
        json!(false),
        json!({"objective":" "}),
        json!({"random":"not a summary"}),
        json!("not structured"),
    ] {
        assert!(store
            .save_context(
                &s,
                0,
                ContextInput {
                    summary,
                    ..valid.clone()
                }
            )
            .is_err());
    }
    assert!(store
        .save_context(
            &s,
            0,
            ContextInput {
                tail_start: 1,
                ..valid.clone()
            }
        )
        .is_err());
    assert_eq!(store.load(&s).unwrap().run.context_epoch, 0);
    assert_eq!(store.save_context(&s, 0, valid).unwrap().epoch, 1);
}
