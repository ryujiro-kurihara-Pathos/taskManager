import { Component, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { AuthStateService } from '../../services/auth-state.service';
import { AuthService } from '../../services/auth.service';
import {
  getPersonalInboxTasks,
  getProjectMembers,
  getProjectsByUserId,
  getTasksByProjectId,
  getTasksByTeamId,
  getTeamById,
  getTeamIdsByUserId,
  getTeamMembersByTeamId,
} from '../../firestore';
import { Project, ProjectMember } from '../../types/project';
import { Task } from '../../types/task';
import { Team } from '../../types/team';
import { TeamMember } from '../../types/team';

export type GoalScope = 'personal' | 'project' | 'team';

export interface Goal {
  id: string;
  title: string;
  description: string;
  dueDate: string | null;
  status: '未着手' | '進行中' | '保留' | '達成';
  priority: '高' | '中' | '低' | null;
  scope: GoalScope;
  ownerId: string | null;
  projectId: string | null;
  teamId: string | null;
  createdByUid: string;
  createdAt: string;
  updatedAt: string;
}

type TaskWithGoal = Task & { goalId?: string | null };

@Component({
  selector: 'app-goals',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './goals.component.html',
})
export class GoalComponent implements OnInit {
  private authState = inject(AuthStateService);
  private authService = inject(AuthService);
  private route = inject(ActivatedRoute);

  readonly tabs: { id: GoalScope; label: string }[] = [
    { id: 'personal', label: '個人目標' },
    { id: 'project', label: 'プロジェクト目標' },
    { id: 'team', label: 'チーム目標' },
  ];

  activeTab = signal<GoalScope>('personal');
  goals = signal<Goal[]>([]);
  myProjects = signal<Project[]>([]);
  myTeams = signal<Team[]>([]);
  projectMembersCache = new Map<string, ProjectMember[]>();
  teamMembersCache = new Map<string, TeamMember[]>();

  selectedGoal = signal<Goal | null>(null);
  detailOpen = signal(false);
  createOpen = signal(false);

  /** 詳細モーダル用（表示時計算） */
  detailProgressPercent = signal<number | null>(null);
  detailLinkedTasks = signal<TaskWithGoal[]>([]);

  /** 新規作成フォーム */
  newGoal: Partial<Goal> = {
    title: '',
    description: '',
    dueDate: null,
    status: '未着手',
    priority: null,
    scope: 'personal',
    ownerId: null,
    projectId: null,
    teamId: null,
  };
  createContextProjectId = '';
  createContextTeamId = '';

  /** 編集用（詳細モーダル内） */
  editDraft: Partial<Goal> = {};

  constructor() {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe(() => void this.applyGoalRouteParams());
  }

  ngOnInit(): void {
    this.authService.watchAuthState((user) => {
      if (!user) {
        this.goals.set([]);
        this.myProjects.set([]);
        this.myTeams.set([]);
        return;
      }
      void this.reloadAll(user.uid).then(() => void this.applyGoalRouteParams());
    });
  }

  /** プロフィール等からの ?tab= &goalId= を反映 */
  private async applyGoalRouteParams(): Promise<void> {
    const uid = this.authState.uid;
    if (!uid) return;
    const pm = this.route.snapshot.queryParamMap;
    const tab = pm.get('tab');
    if (tab === 'personal' || tab === 'project' || tab === 'team') {
      this.activeTab.set(tab);
    }
    const goalId = pm.get('goalId');
    if (!goalId) return;
    if (this.goals().length === 0) {
      await this.reloadAll(uid);
    }
    const g = this.goals().find((x) => x.id === goalId);
    if (g) {
      await this.openDetail(g);
    }
  }

  private toIso(v: unknown): string {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (
      typeof v === 'object' &&
      v !== null &&
      'toDate' in v &&
      typeof (v as { toDate: () => Date }).toDate === 'function'
    ) {
      return (v as { toDate: () => Date }).toDate().toISOString();
    }
    return String(v);
  }

  private docToGoal(id: string, data: Record<string, unknown>): Goal {
    return {
      id,
      title: String(data['title'] ?? ''),
      description: String(data['description'] ?? ''),
      dueDate: (data['dueDate'] as string | null) ?? null,
      status: (data['status'] as Goal['status']) ?? '未着手',
      priority: (data['priority'] as Goal['priority']) ?? null,
      scope: (data['scope'] as GoalScope) ?? 'personal',
      ownerId: (data['ownerId'] as string | null) ?? null,
      projectId: (data['projectId'] as string | null) ?? null,
      teamId: (data['teamId'] as string | null) ?? null,
      createdByUid: String(data['createdByUid'] ?? ''),
      createdAt: this.toIso(data['createdAt']),
      updatedAt: this.toIso(data['updatedAt']),
    };
  }

  async reloadAll(uid: string): Promise<void> {
    const [projects, teamIds] = await Promise.all([
      getProjectsByUserId(uid),
      getTeamIdsByUserId(uid),
    ]);
    this.myProjects.set(projects);
    const teams: Team[] = [];
    for (const tid of teamIds) {
      const t = await getTeamById(tid);
      if (t) teams.push(t);
    }
    this.myTeams.set(teams);

    this.projectMembersCache.clear();
    for (const p of projects) {
      this.projectMembersCache.set(p.id, await getProjectMembers(p.id));
    }
    this.teamMembersCache.clear();
    for (const tid of teamIds) {
      this.teamMembersCache.set(tid, await getTeamMembersByTeamId(tid));
    }

    const collected: Goal[] = [];

    const snapPersonal = await getDocs(
      query(
        collection(db, 'goals'),
        where('scope', '==', 'personal'),
        where('ownerId', '==', uid),
      ),
    );
    snapPersonal.forEach((d) =>
      collected.push(this.docToGoal(d.id, d.data() as Record<string, unknown>)),
    );

    for (const p of projects) {
      const snap = await getDocs(
        query(
          collection(db, 'goals'),
          where('scope', '==', 'project'),
          where('projectId', '==', p.id),
        ),
      );
      snap.forEach((d) =>
        collected.push(this.docToGoal(d.id, d.data() as Record<string, unknown>)),
      );
    }

    for (const tid of teamIds) {
      const snap = await getDocs(
        query(
          collection(db, 'goals'),
          where('scope', '==', 'team'),
          where('teamId', '==', tid),
        ),
      );
      snap.forEach((d) =>
        collected.push(this.docToGoal(d.id, d.data() as Record<string, unknown>)),
      );
    }

    const byId = new Map<string, Goal>();
    for (const g of collected) byId.set(g.id, g);
    this.goals.set([...byId.values()]);
  }

  filteredGoals(): Goal[] {
    const tab = this.activeTab();
    return this.goals().filter((g) => g.scope === tab);
  }

  uid(): string {
    return this.authState.uid;
  }

  canView(goal: Goal): boolean {
    const uid = this.uid();
    if (!uid) return false;
    if (goal.scope === 'personal') return goal.ownerId === uid;
    if (goal.scope === 'project')
      return this.myProjects().some((p) => p.id === goal.projectId);
    if (goal.scope === 'team')
      return this.myTeams().some((t) => t.id === goal.teamId);
    return false;
  }

  private projectMember(uid: string, projectId: string | null): ProjectMember | undefined {
    if (!projectId) return undefined;
    return this.projectMembersCache.get(projectId)?.find((m) => m.userId === uid);
  }

  private teamMember(uid: string, teamId: string | null): TeamMember | undefined {
    if (!teamId) return undefined;
    return this.teamMembersCache.get(teamId)?.find((m) => m.userId === uid);
  }

  canCreate(): boolean {
    const uid = this.uid();
    if (!uid) return false;
    const tab = this.activeTab();
    if (tab === 'personal') return true;
    if (tab === 'project') return this.myProjects().length > 0;
    if (tab === 'team') return this.myTeams().length > 0;
    return false;
  }

  canEdit(goal: Goal): boolean {
    const uid = this.uid();
    if (!uid || !this.canView(goal)) return false;
    if (goal.scope === 'personal') return goal.ownerId === uid;
    if (goal.scope === 'project') {
      const proj = this.myProjects().find((p) => p.id === goal.projectId);
      if (proj?.ownerId === uid) return true;
      const pm = this.projectMember(uid, goal.projectId);
      if (!pm) return false;
      if (goal.createdByUid === uid) return true;
      return pm.role === 'owner' || pm.role === 'admin';
    }
    if (goal.scope === 'team') {
      const team = this.myTeams().find((t) => t.id === goal.teamId);
      if (team?.ownerId === uid) return true;
      const tm = this.teamMember(uid, goal.teamId);
      if (!tm) return false;
      if (goal.createdByUid === uid) return true;
      return tm.role === 'owner' || tm.role === 'admin';
    }
    return false;
  }

  canDelete(goal: Goal): boolean {
    return this.canEdit(goal);
  }

  openCreate(): void {
    const tab = this.activeTab();
    this.newGoal = {
      title: '',
      description: '',
      dueDate: null,
      status: '未着手',
      priority: null,
      scope: tab,
      ownerId: tab === 'personal' ? this.uid() : null,
      projectId: null,
      teamId: null,
    };
    this.createContextProjectId = this.myProjects()[0]?.id ?? '';
    this.createContextTeamId = this.myTeams()[0]?.id ?? '';
    this.createOpen.set(true);
  }

  closeCreate(): void {
    this.createOpen.set(false);
  }

  async submitCreate(): Promise<void> {
    const uid = this.uid();
    if (!uid || !this.newGoal.title?.trim()) return;

    const tab = this.activeTab();
    const now = new Date().toISOString();
    const base = {
      title: this.newGoal.title!.trim(),
      description: (this.newGoal.description ?? '').trim(),
      dueDate: this.newGoal.dueDate || null,
      status: this.newGoal.status ?? '未着手',
      priority: this.newGoal.priority ?? null,
      scope: tab,
      createdByUid: uid,
      createdAt: now,
      updatedAt: now,
    };

    if (tab === 'personal') {
      await addDoc(collection(db, 'goals'), {
        ...base,
        ownerId: uid,
        projectId: null,
        teamId: null,
      });
    } else if (tab === 'project') {
      const pid = this.createContextProjectId;
      if (!pid) return;
      await addDoc(collection(db, 'goals'), {
        ...base,
        ownerId: null,
        projectId: pid,
        teamId: null,
      });
    } else {
      const tid = this.createContextTeamId;
      if (!tid) return;
      await addDoc(collection(db, 'goals'), {
        ...base,
        ownerId: null,
        projectId: null,
        teamId: tid,
      });
    }

    this.closeCreate();
    await this.reloadAll(uid);
  }

  private dateInputValue(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const s = String(iso);
    return s.length >= 10 ? s.slice(0, 10) : s;
  }

  async openDetail(goal: Goal): Promise<void> {
    if (!this.canView(goal)) return;
    this.selectedGoal.set(goal);
    this.editDraft = { ...goal, dueDate: this.dateInputValue(goal.dueDate) };
    this.detailOpen.set(true);
    await this.refreshDetailMetrics(goal);
    await this.openLinkTaskPicker(goal);
  }

  closeDetail(): void {
    this.detailOpen.set(false);
    this.selectedGoal.set(null);
    this.detailProgressPercent.set(null);
    this.detailLinkedTasks.set([]);
    this.linkableTasks.set([]);
  }

  /** 進捗率: 関連タスクの完了数 / 件数（保存せず表示時のみ） */
  async refreshDetailMetrics(goal: Goal): Promise<void> {
    const snap = await getDocs(
      query(collection(db, 'tasks'), where('goalId', '==', goal.id)),
    );
    const tasks: TaskWithGoal[] = [];
    snap.forEach((d) =>
      tasks.push({ id: d.id, ...(d.data() as object) } as TaskWithGoal),
    );

    if (tasks.length === 0) {
      this.detailProgressPercent.set(0);
      this.detailLinkedTasks.set([]);
      return;
    }
    const done = tasks.filter((t) => t.status === '完了').length;
    this.detailProgressPercent.set(Math.round((100 * done) / tasks.length));
    this.detailLinkedTasks.set(tasks);
  }

  isTaskEligibleForGoal(goal: Goal, task: TaskWithGoal): boolean {
    if (goal.scope === 'personal')
      return task.projectId == null && task.teamId == null;
    if (goal.scope === 'project') return task.projectId === goal.projectId;
    if (goal.scope === 'team') return task.teamId === goal.teamId;
    return false;
  }

  taskLinkValid(goal: Goal, task: TaskWithGoal): boolean {
    return this.isTaskEligibleForGoal(goal, task);
  }

  async saveEdit(): Promise<void> {
    const goal = this.selectedGoal();
    const uid = this.uid();
    if (!goal || !uid || !this.canEdit(goal)) return;

    const now = new Date().toISOString();
    await updateDoc(doc(db, 'goals', goal.id), {
      title: this.editDraft.title ?? goal.title,
      description: this.editDraft.description ?? '',
      dueDate: this.editDraft.dueDate ?? null,
      status: this.editDraft.status ?? goal.status,
      priority: this.editDraft.priority ?? null,
      updatedAt: now,
    });
    await this.reloadAll(uid);
    const updated = this.goals().find((g) => g.id === goal.id);
    if (updated) {
      this.selectedGoal.set(updated);
      this.editDraft = { ...updated };
      await this.refreshDetailMetrics(updated);
    }
  }

  async deleteGoal(): Promise<void> {
    const goal = this.selectedGoal();
    const uid = this.uid();
    if (!goal || !uid || !this.canDelete(goal)) return;
    if (!confirm('この目標を削除しますか？')) return;
    await deleteDoc(doc(db, 'goals', goal.id));
    this.closeDetail();
    await this.reloadAll(uid);
  }

  async loadEligibleTasksForLink(goal: Goal): Promise<TaskWithGoal[]> {
    const uid = this.uid();
    if (!uid) return [];
    if (goal.scope === 'personal') {
      const main = await getPersonalInboxTasks(uid);
      return main as TaskWithGoal[];
    }
    if (goal.scope === 'project' && goal.projectId) {
      return (await getTasksByProjectId(goal.projectId)) as TaskWithGoal[];
    }
    if (goal.scope === 'team' && goal.teamId) {
      return (await getTasksByTeamId(goal.teamId)) as TaskWithGoal[];
    }
    return [];
  }

  linkableTasks = signal<TaskWithGoal[]>([]);

  async openLinkTaskPicker(goal: Goal): Promise<void> {
    const list = await this.loadEligibleTasksForLink(goal);
    this.linkableTasks.set(list.filter((t) => this.isTaskEligibleForGoal(goal, t)));
  }

  async linkTask(goal: Goal, task: TaskWithGoal): Promise<void> {
    if (!this.canEdit(goal) || !this.isTaskEligibleForGoal(goal, task)) return;
    await updateDoc(doc(db, 'tasks', task.id), { goalId: goal.id });
    await this.refreshDetailMetrics(goal);
    await this.openLinkTaskPicker(goal);
  }

  async unlinkTask(goal: Goal, task: TaskWithGoal): Promise<void> {
    if (!this.canEdit(goal)) return;
    await updateDoc(doc(db, 'tasks', task.id), { goalId: null });
    await this.refreshDetailMetrics(goal);
    await this.openLinkTaskPicker(goal);
  }

  setTab(tab: GoalScope): void {
    this.activeTab.set(tab);
  }

  projectName(id: string | null): string {
    if (!id) return '';
    return this.myProjects().find((p) => p.id === id)?.name ?? id;
  }

  teamName(id: string | null): string {
    if (!id) return '';
    return this.myTeams().find((t) => t.id === id)?.name ?? id;
  }
}
