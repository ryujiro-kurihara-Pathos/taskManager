export type Invite = {
    id: string;
    type: 'project' | 'team';

    targetId: string;
    invitedUid: string; // 招待された側
    invitedByUid: string; // 招待した側
    status: 'pending' | 'accepted' | 'declined' | 'left';
    createdAt: string;
    email: string;

    isRead: boolean;
    isImportant: boolean;
}

export type AddInviteInput = Omit<Invite, 'id' | 'createdAt'>;

export const initialInviteInput: AddInviteInput = {
    type: 'project',
    targetId: '',
    invitedUid: '',
    invitedByUid: '',
    status: 'pending',
    email: '',
    isRead: false,
    isImportant: false,
}