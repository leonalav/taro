CREATE TABLE runs (
 id TEXT PRIMARY KEY NOT NULL, scope TEXT NOT NULL CHECK(json_valid(scope)),
 root_run_id TEXT NOT NULL REFERENCES runs(id), state TEXT NOT NULL CHECK(state IN ('active','paused','completed','failed','cancelled','interrupted')),
 limits TEXT NOT NULL CHECK(json_valid(limits)), requests_reserved INTEGER NOT NULL DEFAULT 0 CHECK(requests_reserved>=0),
 context_epoch INTEGER NOT NULL DEFAULT 0 CHECK(context_epoch>=0), recovery_attempts INTEGER NOT NULL DEFAULT 0 CHECK(recovery_attempts BETWEEN 0 AND 3),
 sequence INTEGER NOT NULL DEFAULT 0, metadata TEXT NOT NULL CHECK(json_valid(metadata))
);
CREATE TABLE exchanges (id TEXT PRIMARY KEY NOT NULL,run_id TEXT NOT NULL REFERENCES runs(id),sequence INTEGER NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),UNIQUE(run_id,sequence));
CREATE TABLE tool_attempts (id TEXT PRIMARY KEY NOT NULL,run_id TEXT NOT NULL REFERENCES runs(id),record TEXT NOT NULL CHECK(json_valid(record)));
CREATE TABLE request_reservations (id TEXT PRIMARY KEY NOT NULL,run_id TEXT NOT NULL REFERENCES runs(id),record TEXT NOT NULL CHECK(json_valid(record)));
CREATE TABLE events (id TEXT PRIMARY KEY NOT NULL,run_id TEXT NOT NULL REFERENCES runs(id),sequence INTEGER NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),UNIQUE(run_id,sequence));
CREATE TABLE context_epochs (run_id TEXT NOT NULL REFERENCES runs(id),epoch INTEGER NOT NULL,record TEXT NOT NULL CHECK(json_valid(record)),PRIMARY KEY(run_id,epoch));
CREATE TABLE checkpoints (id TEXT PRIMARY KEY NOT NULL,run_id TEXT NOT NULL REFERENCES runs(id),record TEXT NOT NULL CHECK(json_valid(record)));
CREATE TABLE restore_journals (id TEXT PRIMARY KEY NOT NULL,run_id TEXT NOT NULL REFERENCES runs(id),record TEXT NOT NULL CHECK(json_valid(record)));
CREATE TABLE instruction_sources (run_id TEXT NOT NULL REFERENCES runs(id),path TEXT NOT NULL,record TEXT NOT NULL CHECK(json_valid(record)),PRIMARY KEY(run_id,path));
CREATE TABLE child_jobs (id TEXT PRIMARY KEY NOT NULL,run_id TEXT NOT NULL REFERENCES runs(id),record TEXT NOT NULL CHECK(json_valid(record)));
CREATE INDEX events_by_run ON events(run_id,sequence);
CREATE INDEX attempts_by_run ON tool_attempts(run_id);
