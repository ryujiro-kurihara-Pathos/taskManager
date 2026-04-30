import { Component, inject, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AddTeamInput, initialTeamInput, Team } from '../../types/team';
import {
    addTeam,
    addTeamMember,
    getTeamMembersByUserId,
    getTeamsByIds,
    getTeamMembersByTeamId,
} from '../../firestore';
import { AuthStateService } from '../../services/auth-state.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';

@Component({
    selector: 'app-teams',
    templateUrl: './team.component.html',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule],
})

export class TeamComponent {
    authState = inject(AuthStateService);
    authService = inject(AuthService);

    // 追加するチーム
    addingTeam: AddTeamInput = { ...initialTeamInput };
    // teams: Team[] = [];
    teams = signal<Team[]>([]);

    async ngOnInit() {
        this.authService.watchAuthState(async(user) => {
            if(!user) {
                this.clearTeams();
                return;
            }
            this.loadTeams();
        })
    }

    setTeams(teams: Team[]) {
        this.teams.set(teams);
    }

    clearTeams() {
        this.teams.set([]);
    }

    addTeam(team: Team) {
        this.teams.update(teams => [...teams, team]);
    }

    // チームをロードする
    async loadTeams() {
        try {
            const uid = this.authState.uid;
            if(!uid) return;
            const teams = await this.getUserTeams(uid);
            this.setTeams(teams);
        } catch (error) {
            console.error("チームロード失敗: ", error);
        }
    }

    // チームを追加
    async addTeams() {
        try {
            const uid = this.authState.uid;
            if(!uid) return;
            const teamResult: Team = await addTeam({
                name: this.addingTeam.name,
                ownerId: uid,
                description: this.addingTeam.description,
            });
            if(!teamResult) return;
            await addTeamMember({
                teamId: teamResult.id,
                userId: uid,
                role: 'owner',
            });

            this.addTeam(teamResult);
            this.addingTeam = { ...initialTeamInput };
        } catch (error) {
            console.error("チーム追加失敗: ", error);
        }
    }

    // 所属しているチームを取得
    async getUserTeams(uid: string) {
        try {
            if(!uid) return [];
            // ユーザーIDが一致するteamIDを取得
            const teamMemberIds = await getTeamMembersByUserId(uid);
            // teamIDからteamを取得
            const teams = await getTeamsByIds(teamMemberIds);
            return teams;
        } catch (error) {
            console.error("チーム取得失敗: ", error);
            return [];
        }
    }

    // チームメンバーを取得
    async getTeamMembersByTeamId(teamId: string) {
        try {
            const teamMembers = await getTeamMembersByTeamId(teamId);
            return teamMembers;
        } catch (error) {
            console.error("チームメンバー取得失敗: ", error);
            return [];
        }
    }
}