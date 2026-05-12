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

    /** type が team のとき、承諾後に teamMembers に付与するロール（admin / member のみ。owner は不可） */
    teamMemberRole?: 'admin' | 'member';
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