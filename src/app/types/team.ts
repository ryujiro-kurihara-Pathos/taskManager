import { User } from "./user";

export type Team = {
    id: string; // ドキュメントID

    name: string; // チーム名
    ownerId: string; // チーム作成者
    description: string; // チームの説明

    createdAt: string; // チーム作成日時
    // updatedAt: string;
}

export type AddTeamInput = Omit<Team, 'id' | 'createdAt'>;

export const initialTeamInput: AddTeamInput = {
    name: '',
    ownerId: '',
    description: '',
};

export type TeamMember = {
    id: string; // ドキュメントID

    teamId: string; // チームID
    userId: string; // ユーザーID
    role: 'owner' | 'admin' | 'member'; // 役割

    createdAt: string; // チームメンバー作成日時

    user: User | null; // ユーザー情報
};

export type AddTeamMemberInput = Omit<TeamMember, 'id' | 'createdAt' | 'user'>;

export const initialTeamMemberInput: AddTeamMemberInput = {
    teamId: '',
    userId: '',
    role: 'member',
};