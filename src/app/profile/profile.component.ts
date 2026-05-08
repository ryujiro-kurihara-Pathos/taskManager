import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { watchAuthState, updateUserName, logout } from '../auth';

@Component({
    selector: 'app-profile',
    imports: [ RouterLink, FormsModule ],
    templateUrl: './profile.component.html',
})

export class ProfileComponent {
    private router = inject(Router);

    // ユーザー情報
    userName: string = '';
    userEmail: string = '';
    userUid: string = '';

    // 編集用
    editName: string = '';

    // モード切り替え
    isEditing: boolean = false;

    /** ログアウト最終確認 */
    showLogoutConfirm = false;

    ngOnInit() {
        watchAuthState((user) => {
            if(user) {
                this.userName = user.displayName || '';
                this.userEmail = user.email || '';
                this.userUid = user.uid || '';
            } else {
                this.userName = '';
                this.userEmail = '';
                this.userUid = '';
            }
        })
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
        } catch(error) {}
    }

    openLogoutConfirm() {
        this.showLogoutConfirm = true;
    }

    cancelLogoutConfirm() {
        this.showLogoutConfirm = false;
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