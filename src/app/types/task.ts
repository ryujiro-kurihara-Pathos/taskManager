// タスク
export type Task = {
    id: string;
    title: string;
    status: '未着手' | '進行中' | '保留' | '完了';
    priority: '高' | '中' | '低';
    dueDate: string | null;
    startDate: string | null;
    memo: string | null;
    parentTaskId: string | null;
    projectId: string | null;
    createdAt: string;
    // updatedAt: string;
    comments: Comment[];
    subTasks: Task[];
    hierarchyTask: Task[];
    originalTitle: string;
};

export type AddTaskInput = {
    title: string;
    status: '未着手' | '進行中' | '保留' | '完了';
    priority: '高' | '中' | '低';
    dueDate: string | null;
    startDate: string | null;
    memo: string | null;
    parentTaskId: string | null;
    projectId: string | null;
}

export const initialTask: AddTaskInput = {
    title: '',
    status: '未着手',
    priority: '中',
    dueDate: null,
    startDate: null,
    memo: null,
    parentTaskId: null,
    projectId: null,
}

export type Comment = {
    id: string;
    taskId: string;
    content: string;
    uid: string;
    createdAt: string;
}

export type AddCommentInput = {
    taskId: string;
    content: string;
    uid: string;
}