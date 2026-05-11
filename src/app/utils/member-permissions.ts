import type { Project, ProjectMember } from '../types/project';
import type { Team, TeamMember } from '../types/team';

export type MemberRole = 'owner' | 'admin' | 'member';

export function projectMemberRecord(
  members: ProjectMember[] | null | undefined,
  uid: string,
): ProjectMember | undefined {
  return members?.find((m) => m.userId === uid);
}

/** プロジェクト document の ownerId を最優先し、次に projectMembers の role を見る */
export function effectiveProjectRole(
  project: Pick<Project, 'ownerId'>,
  members: ProjectMember[] | null | undefined,
  uid: string,
): MemberRole | null {
  if (!uid) return null;
  if (project.ownerId === uid) return 'owner';
  const m = projectMemberRecord(members, uid);
  if (!m) return null;
  if (m.role === 'owner') return 'owner';
  if (m.role === 'admin') return 'admin';
  return 'member';
}

export function canViewProject(
  members: ProjectMember[] | null | undefined,
  uid: string,
): boolean {
  return !!projectMemberRecord(members, uid);
}

/** プロジェクト名・説明・公開設定などの編集（owner のみ） */
export function canEditProjectBasics(
  project: Pick<Project, 'ownerId'>,
  members: ProjectMember[] | null | undefined,
  uid: string,
): boolean {
  return effectiveProjectRole(project, members, uid) === 'owner';
}

/** メンバー招待・一覧からの除外（owner / admin） */
export function canManageProjectMembers(
  project: Pick<Project, 'ownerId'>,
  members: ProjectMember[] | null | undefined,
  uid: string,
): boolean {
  const r = effectiveProjectRole(project, members, uid);
  return r === 'owner' || r === 'admin';
}

export function canDeleteProject(
  project: Pick<Project, 'ownerId'>,
  members: ProjectMember[] | null | undefined,
  uid: string,
): boolean {
  return effectiveProjectRole(project, members, uid) === 'owner';
}

export function teamMemberRecord(
  members: TeamMember[] | null | undefined,
  uid: string,
): TeamMember | undefined {
  return members?.find((m) => m.userId === uid);
}

export function effectiveTeamRole(
  team: Pick<Team, 'ownerId'>,
  members: TeamMember[] | null | undefined,
  uid: string,
): MemberRole | null {
  if (!uid) return null;
  if (team.ownerId === uid) return 'owner';
  const m = teamMemberRecord(members, uid);
  if (!m) return null;
  if (m.role === 'owner') return 'owner';
  if (m.role === 'admin') return 'admin';
  return 'member';
}

export function canViewTeam(members: TeamMember[] | null | undefined, uid: string): boolean {
  return !!teamMemberRecord(members, uid);
}

/** チーム名・説明の編集（owner のみ。admin はメンバー管理のみ） */
export function canEditTeamBasics(
  team: Pick<Team, 'ownerId'>,
  members: TeamMember[] | null | undefined,
  uid: string,
): boolean {
  return effectiveTeamRole(team, members, uid) === 'owner';
}

/** メンバー招待・チームからの除外（owner / admin） */
export function canManageTeamMembers(
  team: Pick<Team, 'ownerId'>,
  members: TeamMember[] | null | undefined,
  uid: string,
): boolean {
  const r = effectiveTeamRole(team, members, uid);
  return r === 'owner' || r === 'admin';
}

/** チーム削除（teams.ownerId のみ） */
export function canDeleteTeam(team: Pick<Team, 'ownerId'>, uid: string): boolean {
  return !!uid && team.ownerId === uid;
}
