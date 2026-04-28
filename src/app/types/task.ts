// タスク
export type Task = {
    id: string;
    uid: string;
    title: string;
    status: '未着手' | '進行中' | '保留' | '完了' | null;
    priority: '高' | '中' | '低' | null;
    dueDate: string | null;
    startDate: string | null;
    memo: string | null;
    parentTaskId: string | null;

    createdAt: string;
    // updatedAt: string;
    comments: Comment[];
    subTasks: Task[];
    hierarchyTask: Task[];
    originalTitle: string;

    projectId: string | null;
    teamId: string | null;
};

export type AddTaskInput = Omit<Task, 'id' | 'createdAt' | 'comments' | 'subTasks' | 'hierarchyTask' | 'originalTitle'>;

export const initialTask: AddTaskInput = {
    uid: '',
    title: '',
    status: null,
    priority: null,
    dueDate: null,
    startDate: null,
    memo: null,
    parentTaskId: null,

    projectId: null,
    teamId: null,
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

export type SortKey = 'dueDate' | 'createdAt' | 'updatedAt' | null;
export type FilterKey = 'notDone' | 'done' | 'thisWeek' | 'nextWeek' | null;