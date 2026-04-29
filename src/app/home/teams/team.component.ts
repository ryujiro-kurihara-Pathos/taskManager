import { Component, inject } from '@angular/core';
import { AddTeamInput, initialTeamInput, Team } from '../../types/team';
import {
    addTeam,
    addTeamMember,
    getTeamMembersByUserId,
    getTeamsByIds,
} from '../../firestore';
import { AuthStateService } from '../../services/auth-state.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';

@Component({
    selector: 'app-teams',
    templateUrl: './team.component.html',
    standalone: true,
    imports: [CommonModule, FormsModule],
})

export class TeamComponent {
    authState = inject(AuthStateService);
    authService = inject(AuthService);

    // 追加するチーム
    addingTeam: AddTeamInput = { ...initialTeamInput };
    teams: Team[] = [];

    async ngOnInit() {
        this.authService.watchAuthState(async(user) => {
            if(!user) {
                this.teams = [];
                return;
            }
            this.teams = await this.getUserTeams(user.uid);
        })
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
            await addTeamMember({
                teamId: teamResult.id,
                userId: uid,
                role: 'owner',
            });
            
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
}