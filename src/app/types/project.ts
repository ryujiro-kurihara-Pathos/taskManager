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

export type AddProjectInput = {
    name: string;
    ownerId: string;
    memberIds: string[];
    visibility: 'private' | 'members';
    isArchived: boolean;
    description: string;
}

export type ProjectInvite = {
    id: string;
    projectId: string;
    invitedUid: string;
    invitedByUid: string;
    status: 'pending' | 'accepted' | 'rejected';
    createdAt: string;
    email: string;
}

export type AddProjectInviteInput = {
    projectId: string;
    invitedUid: string;
    invitedByUid: string;
    status: 'pending' | 'accepted' | 'rejected';
    email: string;
}

export const initialProjectInviteInput: AddProjectInviteInput = {
    projectId: '',
    invitedUid: '',
    invitedByUid: '',
    status: 'pending',
    email: '',
}