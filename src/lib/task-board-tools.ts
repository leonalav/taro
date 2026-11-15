import { completeTask, createTask, type TaskRepository } from "./task-store";

const string = { type: "string", minLength: 1 };
const strings = { type: "array", items: string, minItems: 1 };
const priority = { type: "string", enum: ["Low", "Medium", "High"] };
const fields = { title: string, description: string, details: string, priority, tags: strings, solution: strings };
const tool = (name: string, description: string, properties: Record<string, unknown>, required: string[]) => ({
  type: "function" as const, function: { name, description, parameters: { type: "object", properties, required, additionalProperties: false } },
});

export const boardTaskTools = [
  tool("TaskList", "Read existing workspace tasks and their IDs before updating or resuming them. Supply task_id to read one task's details.", { task_id: string }, []),
  tool("TaskCreate", "Write a new workspace task in To Do. Use a short title, concrete scope and verification steps based on the request.", fields, Object.keys(fields)),
  tool("TaskUpdate", "Update a task's status or refine its content as work progresses. Use TaskComplete to mark it Done.", {
    task_id: string, ...fields, status: { type: "string", enum: ["To Do", "In Progress", "Failed"] }, error: string,
  }, ["task_id"]),
  tool("TaskComplete", "Mark a task Done after verifying its outcome. Describe the actual work and final product.", {
    task_id: string, whatWasDone: string, finalProduct: string,
  }, ["task_id", "whatWasDone", "finalProduct"]),
];
export const boardTaskToolNames = new Set(boardTaskTools.map(tool => tool.function.name));

function requiredText(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) throw Error(`Provide a non-empty ${field}.`);
  return value.trim();
}
function list(value: unknown, field: string) {
  if (!Array.isArray(value) || !value.length) throw Error(`Provide at least one entry in ${field}.`);
  return value.map(item => requiredText(item, field));
}
function taskFields(input: Record<string, unknown>, required: boolean) {
  const { title, description, details, priority, tags, solution } = input;
  const patch: Partial<ReturnType<typeof createTask>> = {};
  if (required || title !== undefined) patch.title = requiredText(title, "title");
  if (required || description !== undefined) patch.description = requiredText(description, "description");
  if (required || details !== undefined) patch.details = requiredText(details, "details");
  if (required || priority !== undefined) {
    if (priority !== "Low" && priority !== "Medium" && priority !== "High") throw Error("Choose a Low, Medium or High priority.");
    patch.priority = priority;
    patch.severity = priority;
  }
  if (required || tags !== undefined) {
    patch.tags = [...new Set(list(tags, "tags"))];
    if (patch.tags.some(tag => /\s/.test(tag))) throw Error("Use one-word tags.");
  }
  if (required || solution !== undefined) patch.solution = list(solution, "solution");
  return patch;
}

export async function createBoardTask(repository: TaskRepository, workspace: string, input: Record<string, unknown>) {
  const task = { ...createTask(requiredText(input.title, "title")), ...taskFields(input, true) };
  await repository.add(workspace, task);
  return task;
}

export async function executeBoardTask(repository: TaskRepository, workspace: string, name: string, input: Record<string, unknown>) {
  if (name === "TaskCreate") return createBoardTask(repository, workspace, input);
  if (name === "TaskList") {
    await repository.load(workspace);
    const snapshot = repository.snapshot(workspace);
    if (!snapshot.loaded) throw Error(snapshot.error ?? "The workspace task board could not be loaded.");
    const cards = snapshot.unsavedTasks ?? snapshot.tasks;
    if (input.task_id !== undefined) {
      const taskId = requiredText(input.task_id, "task_id");
      const task = cards.find(card => card.id === taskId);
      if (!task) throw Error("Task was not found in this workspace.");
      const { id, title, description, details, solution, status, error, whatWasDone, finalProduct } = task;
      return { task_id: id, title, description, details, solution, status, error, whatWasDone, finalProduct, designPhase: task.designJob?.phase };
    }
    return cards.slice(0, 50).map(({ id, title, description, priority, status }) => ({ task_id: id, title, description, priority, status }));
  }
  const patch = name === "TaskComplete" ? {} : taskFields(input, false);
  const taskId = requiredText(input.task_id, "task_id");
  let status: "To Do" | "In Progress" | "Failed" | undefined;
  if (input.status !== undefined) {
    if (input.status !== "To Do" && input.status !== "In Progress" && input.status !== "Failed") throw Error("Choose To Do, In Progress or Failed.");
    status = input.status;
  }
  let updated!: ReturnType<typeof createTask>;
  await repository.mutate(workspace, taskId, task => {
    if (task.designJob || task.reviewItem || task.runId && task.status === "In Progress") throw Error("This task already has a dedicated workflow.");
    if (name === "TaskComplete") {
      if (task.status !== "In Progress") throw Error("Move the task to In Progress before completing it.");
      return updated = completeTask(task, requiredText(input.whatWasDone, "whatWasDone"), requiredText(input.finalProduct, "finalProduct"));
    }
    if (task.status === "Done") throw Error("Create a new task for follow-up work.");
    const error = status === "Failed" ? requiredText(input.error, "failure reason") : status ? undefined : task.error;
    return updated = { ...task, ...patch, status: status ?? task.status, error };
  });
  return updated;
}
