import {createTask,type TaskRepository} from './task-store';
import {workspaceRuleKey} from './workspace-preferences';
/** Feedback is a real to-do with its own execution and artifacts, never a fake chat call. */
export async function saveSourceReview(workspaceRoot:string,path:string,comment:string,repository:TaskRepository){
  if(!comment.trim())throw Error('Enter a review comment before saving.');
  if(!workspaceRoot||!path)throw Error('A workspace and reviewed file are required.');
  const workspaceId=workspaceRuleKey(workspaceRoot,'taro');
  const task=createTask(`Review ${path}`);task.description=comment.trim();task.details=`Review feedback for ${path}:\n${comment.trim()}`;task.tags=['review'];
  task.solution=[`Inspect ${path} and the current diff before making changes.`,'Address the review feedback, verify the result, and describe the final product.'];
  await repository.load(workspaceId);await repository.add(workspaceId,task);return task.id;
}
