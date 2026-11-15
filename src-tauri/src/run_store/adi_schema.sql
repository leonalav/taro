CREATE TABLE adi_policy_runs (
    id TEXT PRIMARY KEY NOT NULL,
    workspace TEXT NOT NULL,
    session_id TEXT NOT NULL,
    frontend INTEGER NOT NULL,
    digest TEXT,
    generation INTEGER NOT NULL DEFAULT 0,
    target_files TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(target_files)),
    mutation_generation INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE adi_policy_operations (
    run_id TEXT NOT NULL REFERENCES adi_policy_runs(id),
    operation_id TEXT NOT NULL,
    PRIMARY KEY(run_id, operation_id)
);
