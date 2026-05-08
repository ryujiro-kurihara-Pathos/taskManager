import { Component, inject } from '@angular/core';
import {
    getNotifications,
    acceptInvite,
    getTargetIdFromInviteId,
    readNotification,
    getInviteStatus,
 } from '../../firestore';
import { AuthStateService } from '../../services/auth-state.service';
import { Notification } from '../../types/notification';
import { ModalService } from '../../services/modal.service';
import { AuthService } from '../../services/auth.service';
import { TasksService } from '../../services/tasks.service';

@Component({
    selector: 'app-inbox',
    templateUrl: './inbox.component.html',
    standalone: true,
})

export class InboxComponent {
    authState = inject(AuthStateService);
    authService = inject(AuthService);
    modalService = inject(ModalService);
    private tasksService = inject(TasksService);

    // 通知
    notifications: Notification[] = [];
    isReverseOrder: boolean = false;
    // タブ
    activeTab: 'all' | 'unread' | 'important' = 'all';

    async ngOnInit() {
        this.authService.watchAuthState(async(user) => {
            if(!user) {
                this.notifications = [];
                return;
            }
            this.notifications = await this.getNotifications();
        })
    }

    // 詳細モーダルを開く
    async openDetailModal(notification: Notification) {
        await this.modalService.open('notification-detail', notification);
        await readNotification(notification.id);

        // 通知のステータスを取得
        const status = await getInviteStatus(notification.sourceId);
        this.modalService.modalState$.subscribe((modalState) => {
            modalState.data.status = status;
        });

        // 通知を既読にする
        this.notifications = this.notifications.map((item) => {
                if (item.id === notification.id) {
                    return { ...item, isRead: true };
                }
                return item;
            }
        )
    }

    // 招待を承諾
    async acceptInvite(notification: Notification) {
        try {
            if (notification.type !== 'project-invite' && notification.type !== 'team-invite') return;
            const currentUser = this.authState.user();
            if (!currentUser) return;

            // projectInviteIdからprojectIdを取得
            const projectId = await getTargetIdFromInviteId(notification.sourceId);
            if (!projectId) return;

            await acceptInvite(notification.sourceId, currentUser.id);
            // await addProjectMember(projectId, currentUser.id);
        } catch (error) {
            throw error;
        }
    }

    // 通知を取得
    async getNotifications() {
        try {
            const uid = this.authState.uid;
            if(!uid) return [];
            const notifications = await getNotifications(uid);
            return notifications;
        } catch (error) {
            console.error('通知取得失敗: ', error);
            return [];
        }
    }

    // 未読通知を取得
    get unreadNotifications() {
        const unreadNotifications = this.notifications.filter((notification) => !notification.isRead);
        if(this.isReverseOrder) {
            unreadNotifications.reverse();
        }
        return unreadNotifications;
    }

    // 重要通知を取得
    get importantNotifications() {
        const importantNotifications = this.notifications.filter((notification) => notification.isImportant);
        if(this.isReverseOrder) {
            importantNotifications.reverse();
        }
        return importantNotifications;
    }

    // 通知の表示
    get displayNotifications() {
        const displayNotifications = this.notifications.sort((a, b) => {
            if(!a.createdAt || !b.createdAt) return 0;
            const aTime = this.tasksService.getTimeValue(a.createdAt);
            const bTime = this.tasksService.getTimeValue(b.createdAt);
            return bTime - aTime;
        });
        if(this.isReverseOrder) {
            displayNotifications.reverse();
        }
        return displayNotifications;
    }

    // 未読件数
    get unreadCount() {
        return this.notifications.filter((n) => !n.isRead).length;
    }

    // 通知日時の表示
    displayNotificationDate(notification: Notification) {
        return this.tasksService.displayTime(notification.createdAt, 'date');
    }
}   