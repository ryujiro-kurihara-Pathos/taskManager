import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { watchAuthState, updateUserName, logout } from '../auth';
import {
    countActiveProjectsForUser,
    getPersonalGoalProgressSummary,
    getPersonalInboxTasks,
    getTeamIdsByUserId,
    getTeamsByIds,
    getUser,
    type PersonalGoalProgressSummary,
} from '../firestore';
import { AuthStateService } from '../services/auth-state.service';
import { Task } from '../types/task';
import { Team } from '../types/team';
import { userAvatarInitial } from '../utils/user-avatar';

/** プロフィール「個人レポート」表示用 */
export type PersonalTaskReport = {
    assignedCount: number;
    notDoneCount: number;
    doneCount: number;
    dueSoonCount: number;
    overdueCount: number;
};

export type RecentActivityItem = {
    taskId: string;
    title: string;
    updatedAt: string;
};

@Component({
    selector: 'app-profile',
    imports: [RouterLink, FormsModule],
    templateUrl: './profile.component.html',
})
export class ProfileComponent implements OnInit, OnDestroy {
    private router = inject(Router);
    private route = inject(ActivatedRoute);
    private authState = inject(AuthStateService);

    private paramSub?: Subscription;
    private authUnsub?: () => void;

    userName = '';
    userEmail = '';
    userUid = '';

    /** 表示しているプロフィールのユーザー（ルート param または自分） */
    displayUid = '';
    isOwnProfile = true;
    profileNotFound = false;

    editName = '';
    isEditing = false;
    showLogoutConfirm = false;

    teams: Team[] = [];
    teamsLoading = false;

    taskReportLoading = false;
    taskReportError: string | null = null;
    taskReport: PersonalTaskReport | null = null;

    activeProjectCount: number | null = null;
    goalsSummary: PersonalGoalProgressSummary | null = null;

    recentActivity: RecentActivityItem[] = [];

    ngOnInit(): void {
        this.paramSub = this.route.paramMap.subscribe(() => {
            void this.syncRouteAndLoad();
        });
        this.authUnsub = watchAuthState(() => {
            void this.syncRouteAndLoad();
        });
    }

    ngOnDestroy(): void {
        this.paramSub?.unsubscribe();
        this.authUnsub?.();
    }

    avatarLetter(): string {
        return userAvatarInitial(this.userName);
    }

    private async syncRouteAndLoad(): Promise<void> {
        const self = this.authState.uid;
        if (!self) return;

        const paramId = this.route.snapshot.paramMap.get('userId');
        const target = paramId?.trim() || self;
        this.displayUid = target;
        this.isOwnProfile = target === self;

        this.profileNotFound = false;
        this.isEditing = false;
        this.showLogoutConfirm = false;

        await this.loadProfileFor(target);
    }

    private async loadProfileFor(targetUid: string): Promise<void> {
        this.taskReportLoading = true;
        this.taskReportError = null;
        this.taskReport = null;
        this.goalsSummary = null;
        this.activeProjectCount = null;
        this.recentActivity = [];

        try {
            const u = await getUser(targetUid);
            if (!u) {
                this.profileNotFound = true;
                this.userName = '';
                this.userEmail = '';
                this.userUid = '';
                this.teams = [];
                this.teamsLoading = false;
                return;
            }
            this.userName = u.userName?.trim() || '';
            this.userEmail = u.email || '';
            this.userUid = u.id;

            await this.loadTeams(targetUid);

            if (this.isOwnProfile) {
                await this.loadDashboard(targetUid);
            } else {
                await this.loadActivityHistoryOnly(targetUid);
            }
        } catch {
            this.profileNotFound = true;
        } finally {
            this.taskReportLoading = false;
        }
    }

    private async loadTeams(uid: string): Promise<void> {
        this.teamsLoading = true;
        try {
            const ids = [...new Set(await getTeamIdsByUserId(uid))];
            this.teams = await getTeamsByIds(ids);
        } catch {
            this.teams = [];
        } finally {
            this.teamsLoading = false;
        }
    }

    private async loadDashboard(uid: string): Promise<void> {
        this.taskReportError = null;
        this.taskReport = null;
        this.goalsSummary = null;
        this.recentActivity = [];
        try {
            const [raw, activeProjects, goalSummary] = await Promise.all([
                getPersonalInboxTasks(uid),
                countActiveProjectsForUser(uid),
                getPersonalGoalProgressSummary(uid),
            ]);
            const tasks = raw as Task[];
            this.taskReport = this.computeTaskReport(tasks, uid);
            this.activeProjectCount = activeProjects;
            this.goalsSummary = goalSummary;
            this.recentActivity = this.buildRecentActivity(tasks);
        } catch {
            this.taskReportError = 'データの読み込みに失敗しました。';
        }
    }

    /** 他者閲覧: 個人レポートは出さず履歴のみ */
    private async loadActivityHistoryOnly(uid: string): Promise<void> {
        this.taskReportError = null;
        this.recentActivity = [];
        try {
            const raw = await getPersonalInboxTasks(uid);
            const tasks = raw as Task[];
            this.recentActivity = this.buildRecentActivity(tasks);
        } catch {
            this.taskReportError = '履歴の読み込みに失敗しました。';
        }
    }

    private computeTaskReport(tasks: Task[], uid: string): PersonalTaskReport {
        const inScope = (t: Task) => t.uid === uid || t.assignedUid === uid;

        const scoped = tasks.filter(inScope);

        const assignedCount = scoped.filter((t) => t.assignedUid === uid).length;

        let notDoneCount = 0;
        let doneCount = 0;
        let dueSoonCount = 0;
        let overdueCount = 0;

        for (const t of scoped) {
            if (t.status === '完了') {
                doneCount++;
            } else {
                notDoneCount++;
                const due = t.dueDate;
                if (due) {
                    const diffDays = this.dueDateDiffDaysFromToday(due);
                    if (diffDays < 0) overdueCount++;
                    else if (diffDays <= 2) dueSoonCount++;
                }
            }
        }

        return {
            assignedCount,
            notDoneCount,
            doneCount,
            dueSoonCount,
            overdueCount,
        };
    }

    private dueDateDiffDaysFromToday(dueDate: string): number {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const due = new Date(dueDate);
        due.setHours(0, 0, 0, 0);
        return (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    }

    private buildRecentActivity(tasks: Task[]): RecentActivityItem[] {
        const sorted = [...tasks].sort((a, b) => {
            const ta = this.parseTimeMs(a.updatedAt);
            const tb = this.parseTimeMs(b.updatedAt);
            return tb - ta;
        });
        return sorted.slice(0, 8).map((t) => ({
            taskId: t.id,
            title: t.title,
            updatedAt: typeof t.updatedAt === 'string' ? t.updatedAt : '',
        }));
    }

    private parseTimeMs(value: unknown): number {
        if (value == null || value === '') return 0;
        if (typeof value === 'object' && value !== null) {
            const v = value as { toDate?: () => Date; seconds?: number };
            if (typeof v.toDate === 'function') {
                return v.toDate().getTime();
            }
            if (typeof v.seconds === 'number') {
                return v.seconds * 1000;
            }
        }
        const d = new Date(value as string);
        const x = d.getTime();
        return Number.isNaN(x) ? 0 : x;
    }

    goalsRouterLink(): string[] {
        return ['/home/goals'];
    }

    goalsQueryParams(): Record<string, string> {
        const g = this.goalsSummary;
        const q: Record<string, string> = { tab: 'personal' };
        if (g?.primaryGoalId) {
            q['goalId'] = g.primaryGoalId;
        }
        return q;
    }

    startEdit(): void {
        if (!this.isOwnProfile) return;
        this.isEditing = true;
        this.editName = this.userName;
    }

    cancelEdit(): void {
        this.isEditing = false;
    }

    async saveEdit(): Promise<void> {
        if (!this.isOwnProfile) return;
        try {
            await updateUserName(this.editName);
            this.userName = this.editName;
            this.isEditing = false;
        } catch {
            /* 失敗時はそのまま */
        }
    }

    openLogoutConfirm(): void {
        if (!this.isOwnProfile) return;
        this.showLogoutConfirm = true;
    }

    cancelLogoutConfirm(): void {
        this.showLogoutConfirm = false;
    }

    formatActivityTime(raw: string): string {
        if (!raw?.trim()) return '—';
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return raw;
        return d.toLocaleString('ja-JP', {
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        });
    }

    async confirmLogout(): Promise<void> {
        this.showLogoutConfirm = false;
        try {
            await logout();
            await this.router.navigate(['/login']);
        } catch (error) {
            console.error(error);
        }
    }
}
