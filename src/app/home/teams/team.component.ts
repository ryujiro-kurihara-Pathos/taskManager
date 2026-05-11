import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { Team, TeamMember } from '../../types/team';
import {
    addTeam as addTeamToFirestore,
    addTeamMember,
    getTeamsByIds,
    getTeamIdsByUserId,
    getTeamMembersByTeamId,
    getTaskCountByTeamId,
    getUser,
} from '../../firestore';
import { AuthStateService } from '../../services/auth-state.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { TasksService } from '../../services/tasks.service';
import { userAvatarInitial } from '../../utils/user-avatar';

/** 一覧表示用（タスク数・メンバー解決済み） */
type TeamListRow = Team & {
    taskCount: number;
    teamMembers: TeamMember[];
};

@Component({
    selector: 'app-teams',
    templateUrl: './team.component.html',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule],
})
export class TeamComponent implements OnInit {
    authState = inject(AuthStateService);
    authService = inject(AuthService);
    tasksService = inject(TasksService);
    private router = inject(Router);

    teams = signal<TeamListRow[]>([]);

    searchQuery = signal('');
    filteredTeams = computed(() => this.filterTeamsBySearchQuery(this.teams()));

    isTeamAddModalOpen = false;
    newTeamName = '';
    newTeamDescription = '';

    ngOnInit() {
        this.authService.watchAuthState(async (user) => {
            if (!user) {
                this.clearTeams();
                return;
            }
            await this.loadTeams();
        });
    }

    setTeams(rows: TeamListRow[]) {
        this.teams.set(rows);
    }

    clearTeams() {
        this.teams.set([]);
    }

    private pushTeamRow(row: TeamListRow) {
        this.teams.update((teams) => [row, ...teams]);
    }

    async loadTeams() {
        try {
            const uid = this.authState.uid;
            if (!uid) return;
            const teamIds = [...new Set(await getTeamIdsByUserId(uid))];
            const list = await getTeamsByIds(teamIds);
            const hydrated = await Promise.all(list.map((t) => this.hydrateTeamRow(t)));
            this.setTeams(hydrated);
        } catch (error) {
            console.error('チームロード失敗: ', error);
        }
    }

    private async hydrateTeamRow(team: Team): Promise<TeamListRow> {
        const [taskCount, rawMembers] = await Promise.all([
            this.safeTaskCount(team.id),
            getTeamMembersByTeamId(team.id),
        ]);
        const teamMembers = await Promise.all(
            rawMembers.map(async (m) => {
                const user = await getUser(m.userId);
                return { ...m, user } as TeamMember;
            }),
        );
        return {
            ...team,
            taskCount,
            teamMembers,
        };
    }

    private async safeTaskCount(teamId: string): Promise<number> {
        try {
            return await getTaskCountByTeamId(teamId);
        } catch (error) {
            console.error('タスク数取得に失敗しました', error);
            return 0;
        }
    }

    private normalizeForSearch(value: unknown): string {
        const s = value == null ? '' : String(value);
        try {
            return s.normalize('NFKC').trim().toLowerCase();
        } catch {
            return s.trim().toLowerCase();
        }
    }

    private filterTeamsBySearchQuery(rows: TeamListRow[]): TeamListRow[] {
        const q = this.normalizeForSearch(this.searchQuery());
        if (!q) return rows;
        return rows.filter((t) => this.normalizeForSearch(t.name).includes(q));
    }

    openTeamAddModal() {
        this.isTeamAddModalOpen = true;
    }

    closeTeamAddModal() {
        this.isTeamAddModalOpen = false;
        this.newTeamName = '';
        this.newTeamDescription = '';
    }

    /** 作成モーダルから送信 */
    async submitCreateTeam() {
        try {
            if (this.newTeamName.trim() === '') return;
            const uid = this.authState.uid;
            if (!uid) return;

            const teamResult = await addTeamToFirestore({
                name: this.newTeamName.trim(),
                ownerId: uid,
                description: this.newTeamDescription.trim(),
            });
            if (!teamResult) return;

            await addTeamMember({
                teamId: teamResult.id,
                userId: uid,
                role: 'owner',
            });

            const row = await this.hydrateTeamRow(teamResult);
            this.pushTeamRow(row);
            this.closeTeamAddModal();
        } catch (error) {
            console.error('チーム追加失敗: ', error);
        }
    }

    avatarLetter(name: string | null | undefined): string {
        return userAvatarInitial(name);
    }

    goMemberProfile(userId: string, event: Event): void {
        event.preventDefault();
        event.stopPropagation();
        void this.router.navigate(['/profile', userId]);
    }
}
