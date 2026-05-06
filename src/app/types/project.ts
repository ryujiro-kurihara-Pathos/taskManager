import { User } from "./user";

// プロジェクト
export type Project = {
    id: string;
    name: string;
    ownerId: string;
    visibility: 'private' | 'members';
    description: string;

    createdAt: string;
    updatedAt: string;
    
    teamId: string | null;
    projectMembers: ProjectMember[] | null;
}
export type AddProjectInput = Omit<Project, 'id' | 'createdAt' | 'updatedAt'>;

// プロジェクトメンバー
export type ProjectMember = {
    id: string; // ドキュメントID

    projectId: string; // プロジェクトID
    userId: string; // ユーザーID
    role: 'owner' | 'admin' | 'member'; // 役割

    createdAt: string; // プロジェクトメンバー作成日時

    user: User | null; // ユーザー情報
}

export type AddProjectMemberInput = Omit<ProjectMember, 'id' | 'createdAt' | 'user'>;

export const initialProjectMemberInput: AddProjectMemberInput = {
    projectId: '',
    userId: '',
    role: 'member',
};

// export type ProjectInvite = {
//     id: string;
//     projectId: string;
//     invitedUid: string; // 招待された側
//     invitedByUid: string; // 招待した側
//     status: 'pending' | 'accepted' | 'declined' | 'left';
//     createdAt: string;
//     email: string;

//     isRead: boolean;
//     isImportant: boolean;
// }

// export type AddProjectInviteInput = Omit<ProjectInvite, 'id' | 'createdAt'>;

// export const initialProjectInviteInput: AddProjectInviteInput = {
//     projectId: '',
//     invitedUid: '',
//     invitedByUid: '',
//     status: 'pending',
//     email: '',
//     isRead: false,
//     isImportant: false,
// }

