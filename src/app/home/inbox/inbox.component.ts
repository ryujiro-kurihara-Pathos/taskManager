import { Component, inject } from '@angular/core';
import {
    getNotifications,
    acceptProjectInvite,
    addProjectMember,
    getProjectIdFromProjectInviteId,
    readNotification,
    getProjectInviteStatus,
 } from '../../firestore';
import { AuthStateService } from '../../services/auth-state.service';
import { Notification } from '../../types/notification';
import { ModalService } from '../../services/modal.service';

@Component({
    selector: 'app-inbox',
    templateUrl: './inbox.component.html',
    standalone: true,
})

export class InboxComponent {
    authState = inject(AuthStateService);
    modalService = inject(ModalService);
    // 通知：招待一覧
    notifications: Notification[] = [];
    // タブ
    activeTab: 'all' | 'unread' | 'important' = 'all';

    async ngOnInit() {
        this.notifications = await getNotifications(this.authState.uid);
    }

    // 詳細モーダルを開く
    async openDetailModal(notification: Notification) {
        await this.modalService.open('notification-detail', notification);
        await readNotification(notification.id);

        // 通知のステータスを取得
        const status = await getProjectInviteStatus(notification.sourceId);
        this.modalService.modalState$.subscribe((modalState) => {
            modalState.data.status = status;
        });

        // 通知を既読にする
        this.notifications = this.notifications.map((notification) => {
                if (notification.id === notification.id) {
                    return { ...notification, isRead: true };
                }
                return notification;
            }
        )
    }

    // 招待を承諾
    async acceptInvite(notification: Notification) {
        try {
            if (notification.type !== 'project-invite') return;
            const currentUser = this.authState.user();
            if (!currentUser) return;

            // projectInviteIdからprojectIdを取得
            const projectId = await getProjectIdFromProjectInviteId(notification.sourceId);
            if (!projectId) return;

            await acceptProjectInvite(notification.sourceId, currentUser.id);
            await addProjectMember(projectId, currentUser.id);
        } catch (error) {
            throw error;
        }
    }

    // 未読通知を取得
    getUnreadNotifications() {
        return this.notifications.filter((notification) => !notification.isRead);
    }

    // 重要通知を取得
    getImportantNotifications() {
        return this.notifications.filter((notification) => notification.isImportant);
    }
}   