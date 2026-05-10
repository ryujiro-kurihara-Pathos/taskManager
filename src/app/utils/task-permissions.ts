import { Task } from '../types/task';

/** Firestore の `uid`（作成者）が現在ユーザーと一致するか */
export function isTaskCreator(task: Task | null | undefined, uid: string): boolean {
    if (!task?.id || !uid) return false;
    return task.uid === uid;
}
