import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { watchAuthState, updateUserName, logout } from '../auth';
import {
    countActiveProjectsForUser,
    getPersonalGoalProgressSummary,
    getPersonalInboxTasks,
    getTeamIdsByUserId,
    getTeamsByIds,
    type PersonalGoalProgressSummary,
} from '../firestore';
import { Task } from '../types/task';
import { Team } from '../types/team';

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
export class ProfileComponent {
    private router = inject(Router);

    userName = '';
    userEmail = '';
    userUid = '';

    editName = '';
    isEditing = false;
    showLogoutConfirm = false;

    /** 所属チーム */
    teams: Team[] = [];
    teamsLoading = false;

    taskReportLoading = false;
    taskReportError: string | null = null;
    taskReport: PersonalTaskReport | null = null;

    activeProjectCount: number | null = null;
    goalsSummary: PersonalGoalProgressSummary | null = null;

    recentActivity: RecentActivityItem[] = [];

    ngOnInit() {
        watchAuthState((user) => {
            if (user) {
                this.userName = user.displayName || '';
                this.userEmail = user.email || '';
                this.userUid = user.uid || '';
                void this.loadTeams(user.uid);
                void this.loadDashboard(user.uid);
            } else {
                this.userName = '';
                this.userEmail = '';
                this.userUid = '';
                this.teams = [];
                this.taskReportLoading = false;
                this.taskReportError = null;
                this.taskReport = null;
                this.activeProjectCount = null;
                this.goalsSummary = null;
                this.recentActivity = [];
            }
        });
    }

    private async loadTeams(uid: string) {
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

    private async loadDashboard(uid: string) {
        this.taskReportLoading = true;
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
        } finally {
            this.taskReportLoading = false;
        }
    }

    private computeTaskReport(tasks: Task[], uid: string): PersonalTaskReport {
        const inScope = (t: Task) =>
            t.uid === uid || t.assignedUid === uid;

        const scoped = tasks.filter(inScope);

        const assignedCount = scoped.filter(
            (t) => t.assignedUid === uid,
        ).length;

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

    startEdit() {
        this.isEditing = true;
        this.editName = this.userName;
    }

    cancelEdit() {
        this.isEditing = false;
    }

    async saveEdit() {
        try {
            await updateUserName(this.editName);
            this.userName = this.editName;
            this.isEditing = false;
        } catch {}
    }

    openLogoutConfirm() {
        this.showLogoutConfirm = true;
    }

    cancelLogoutConfirm() {
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

    async confirmLogout() {
        this.showLogoutConfirm = false;
        try {
            await logout();
            await this.router.navigate(['/login']);
        } catch (error) {
            console.error(error);
        }
    }
}
