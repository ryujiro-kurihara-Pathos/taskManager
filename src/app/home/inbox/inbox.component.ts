import { Component, inject } from '@angular/core';
import { getNotifications } from '../../firestore';
import { AuthStateService } from '../../services/auth-state.service';
import { Notification } from '../../types/notification';

@Component({
    selector: 'app-inbox',
    templateUrl: './inbox.component.html',
    standalone: true,
})

export class InboxComponent {
    authState = inject(AuthStateService);
    // 通知：招待一覧
    notifications: Notification[] = [];
    // タブ
    activeTab: 'all' | 'unread' | 'important' = 'all';

    async ngOnInit() {
        this.notifications = await getNotifications(this.authState.uid);
    }
}