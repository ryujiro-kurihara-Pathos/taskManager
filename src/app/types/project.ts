export type Project = {
    id: string;
    name: string;
    ownerId: string;
    memberIds: string[];
    visibility: 'private' | 'members';
    isArchived: boolean;
    description: string;
    createdAt: string;
}

export type AddProjectInput = Omit<Project, 'id' | 'createdAt'>;

export type ProjectInvite = {
    id: string;
    projectId: string;
    invitedUid: string; // 招待された側
    invitedByUid: string; // 招待した側
    status: 'pending' | 'accepted' | 'declined' | 'left';
    createdAt: string;
    email: string;
}

export type AddProjectInviteInput = Omit<ProjectInvite, 'id' | 'createdAt'>;

export const initialProjectInviteInput: AddProjectInviteInput = {
    projectId: '',
    invitedUid: '',
    invitedByUid: '',
    status: 'pending',
    email: '',
}