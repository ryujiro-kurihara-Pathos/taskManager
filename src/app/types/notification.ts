export type NotificationType = 
'project-invite' |
'team-invite' |
'task-deadline';

export type Notification = {
    id: string; // 通知ドキュメントID
    uid: string; // 通知を受け取るユーザーID
    
    type: NotificationType; // 通知の種類

    title: string; // 通知のタイトル
    message: string; // 通知のメッセージ

    fromUid?: string; // 通知を送信したユーザー
    fromName?: string;

    sourceId: string; // 通知のソースID
    
    isRead: boolean; // 通知が既読かどうか
    isImportant: boolean; // 通知が重要かどうか

    createdAt: string; // 通知作成日時

    status?: 'pending' | 'accepted' | 'declined' | 'left'; // 招待のステータス
}

export type AddNotificationInput = Omit<Notification, 'id' | 'createdAt' | 'fromName'>;