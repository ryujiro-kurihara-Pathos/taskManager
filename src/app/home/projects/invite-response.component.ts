import { Component, inject } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { arrayUnion, doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { ProjectInvite } from "../../types/project";
import { AuthStateService } from "../../services/auth-state.service";


@Component({
    selector: 'app-invite-response',
    templateUrl: './invite-response.component.html',
    standalone: true,
})

export class InviteResponseComponent {
    private route = inject(ActivatedRoute);
    private authState = inject(AuthStateService);

    invite: ProjectInvite | null = null;
    inviteId: string | null = null;
    message = '';

    async ngOnInit() {
        // URLから招待IDを取得
        this.inviteId = this.route.snapshot.paramMap.get('inviteId');
        if(!this.inviteId) {
            this.message = '招待IDがありません';
            return;
        }

        // 招待を取得
        this.invite = await this.getInviteById(this.inviteId);

        if(!this.invite) {
            this.message = '招待が見つかりません';
            return;
        }

        if (this.invite.status === 'pending') {
            this.message = 'プロジェクトに招待されました。';
        } else if (this.invite.status === 'accepted') {
            this.message = 'すでにプロジェクトに参加しています。';
        } else if (this.invite.status === 'declined') {
            this.message = '招待を辞退しました。';
        }
    }
    // 招待を取得
    async getInviteById(inviteId: string) {
        const inviteRef = doc(db, 'projectInvites', inviteId);
        const inviteSnap = await getDoc(inviteRef);

        if(!inviteSnap.exists()) {
            return null;
        }

        return {
            id: inviteSnap.id,
            ...(inviteSnap.data() as Omit<ProjectInvite, 'id'>),
        };
    }
    // 招待を承認
    async acceptInvite() {
        if(!this.invite) return;
        if(this.invite.status !== 'pending') return;

        const currentUser = this.authState.user();

        if (!currentUser) {
            this.message = 'ログインしてください';
            return;
        }

        try {
            await this.acceptProjectInvite(this.invite.id, currentUser.id);
            await this.addProjectMember(this.invite.projectId, currentUser.id);
            this.message = '招待を承認しました';
        } catch (error) {
            this.message = error instanceof Error ? error.message : '招待の承認に失敗しました';
        }
    }
    // projectInviteを承認に変更
    async acceptProjectInvite(inviteId: string, userId: string) {
        try {
            const projectInviteRef = doc(db, 'projectInvites', inviteId);
            // projectInviteのデータを更新する
            await updateDoc(projectInviteRef, {
                status: 'accepted',
            });
        } catch (error) {
            throw new Error('招待の承認に失敗しました');
        }
    }

    // 承認したユーザーをプロジェクトメンバーに加える
    async addProjectMember(projectId: string, userId: string) {
        try {
            const projectRef = doc(db, 'projects', projectId);
            await updateDoc(projectRef, {
                memberIds: arrayUnion(userId),
            });
        } catch (error) {
            throw new Error('プロジェクトメンバーの追加に失敗しました');
        }
    }
    // 招退を辞退
    async declineInvite() {
        if(!this.invite) return;
        if(this.invite.status !== 'pending') return;

        try {
            await this.declineProjectInvite(this.invite.id);
        } catch (error) {
            this.message = error instanceof Error ? error.message : '招待の辞退に失敗しました';
        }
        this.message = '招待を辞退しました';
    }
    // 招待を辞退に変更
    async declineProjectInvite(inviteId: string) {
        try {
            const projectInviteRef = doc(db, 'projectInvites', inviteId);
            await updateDoc(projectInviteRef, {
                status: 'declined',
            });
        } catch (error) {
            throw new Error('招待の辞退に失敗しました');
        }
    }
}