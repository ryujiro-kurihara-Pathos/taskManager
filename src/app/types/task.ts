import { User } from "./user";

// タスク
export type Task = {
    id: string; // タスクID
    uid: string; // 作成者ID
    title: string; // タスク名
    status: '未着手' | '進行中' | '保留' | '完了'; // ステータス
    priority: '高' | '中' | '低' | null; // 優先度
    dueDate: string | null; // 期日
    startDate: string | null; // 開始日
    memo: string | null; // メモ
    parentTaskId: string | null; // 親タスクID

    assignedUid: string | null; // 担当者ID
    assignableUsers: User[] | null; // 担当者候補

    createdAt: string; // 作成日時
    updatedAt: string;

    comments: Comment[]; // コメント
    subTasks: Task[]; // サブタスク
    hierarchyTask: Task[]; // 階層タスク
    originalTitle: string; // 元のタスク名

    projectId: string | null; // プロジェクトID
    teamId: string | null; // チームID
};

export type AddTaskInput = Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'assignableUsers' | 'comments' | 'subTasks' | 'hierarchyTask' | 'originalTitle'>;

export const initialTask: AddTaskInput = {
    uid: '',
    title: '',
    status: '未着手',
    priority: null,
    dueDate: null,
    startDate: null,
    memo: null,
    parentTaskId: null,
    assignedUid: null,

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