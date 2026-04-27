export type NotificationType = 
'project-invite' |
'task-deadline';

export type SourceType = 'project' | 'task';

export type Notification = {
    id: string; // 通知ドキュメントID
    uid: string; // 通知を受け取るユーザーID
    
    type: NotificationType; // 通知の種類

    title: string; // 通知のタイトル
    message: string; // 通知のメッセージ

    sourceType: SourceType; // 通知のソースの種類
    sourceId: string; // 通知のソースID

    projectInviteId?: string; // プロジェクト招待ID
    
    isRead: boolean; // 通知が既読かどうか
    isImportant: boolean; // 通知が重要かどうか

    createdAt: string; // 通知作成日時
}

export type AddNotificationInput = Omit<Notification, 'id' | 'createdAt'>;