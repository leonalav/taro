import {describe,it,expect} from 'vitest';
import {createTaskRepository} from './task-store';
import {saveSourceReview} from './source-review';
describe('source review comments',()=>{
  it('saves review feedback as a durable workspace task without using the chat transcript',async()=>{
    const disk=new Map<string,string>();const repository=createTaskRepository({read:async key=>disk.get(key)??null,write:async(key,value)=>{disk.set(key,value);}});
    await saveSourceReview('A:/repo','src/form.ts','Please handle empty input.',repository);
    const saved=repository.snapshot('path:a:/repo').tasks[0];
    expect(saved.status).toBe('To Do');expect(saved.tags).toEqual(['review']);expect(saved.description).toBe('Please handle empty input.');expect(saved.details).toContain('src/form.ts');expect(saved.messages).toEqual([]);
    expect(JSON.stringify([...disk.values()])).toContain('Please handle empty input.');
    await expect(saveSourceReview('A:/repo','src/form.ts',' ',repository)).rejects.toThrow(/comment/i);
  });
});
