import { NgIf } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { onAuthStateChanged, reload, User } from 'firebase/auth';
import { auth } from '../firebase';
import { logout, sendVerificationEmail } from '../auth';
import { firebaseAuthErrorMessage } from '../utils/firebase-auth-message';

@Component({
    selector: 'app-verify-email',
    standalone: true,
    imports: [RouterLink, NgIf],
    templateUrl: './verify-email.component.html',
    styles: [
        `
            :host {
                display: block;
            }
            .verify-email {
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 24px;
                background: #f0f0f0;
            }
            .card {
                max-width: 420px;
                width: 100%;
                background: #fff;
                border-radius: 12px;
                padding: 28px 24px;
                box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
            }
            h1 {
                font-size: 1.35rem;
                margin: 0 0 12px;
            }
            .lead {
                margin: 0 0 12px;
                line-height: 1.6;
                color: #333;
                font-size: 0.95rem;
            }
            .email {
                font-weight: 600;
                margin: 0 0 20px;
                word-break: break-all;
            }
            .actions {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            button {
                border-radius: 8px;
                padding: 10px 14px;
                font-size: 0.95rem;
                cursor: pointer;
                border: none;
            }
            button.primary {
                background: #1a73e8;
                color: #fff;
            }
            button.primary:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }
            button.secondary {
                background: #e8eaed;
                color: #202124;
            }
            button.secondary:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }
            button.link {
                background: transparent;
                color: #1a73e8;
                text-decoration: underline;
            }
            .back {
                display: inline-block;
                margin-top: 18px;
                font-size: 0.9rem;
                color: #1a73e8;
            }
        `,
    ],
})
export class VerifyEmailComponent implements OnInit, OnDestroy {
    email: string | null = null;
    resendBusy = false;
    reloadBusy = false;
    private unsub: (() => void) | null = null;

    constructor(private router: Router) {}

    ngOnInit(): void {
        this.unsub = onAuthStateChanged(auth, (user: User | null) => {
            if (!user) {
                void this.router.navigate(['/login']);
                return;
            }
            if (user.emailVerified) {
                void this.router.navigate(['/home']);
                return;
            }
            this.email = user.email ?? null;
        });
    }

    ngOnDestroy(): void {
        this.unsub?.();
    }

    async onResend(): Promise<void> {
        const user = auth.currentUser;
        if (!user || user.emailVerified) return;
        this.resendBusy = true;
        try {
            await sendVerificationEmail(user);
            alert('確認メールを再送信しました。受信トレイをご確認ください。');
        } catch (e) {
            console.error(e);
            alert(firebaseAuthErrorMessage(e, 'oob'));
        } finally {
            this.resendBusy = false;
        }
    }

    async onReloadAndContinue(): Promise<void> {
        const user = auth.currentUser;
        if (!user) return;
        this.reloadBusy = true;
        try {
            await reload(user);
            if (auth.currentUser?.emailVerified) {
                void this.router.navigate(['/home']);
            } else {
                alert('まだメールが確認されていません。メール内のリンクを開いてから「確認済みで続ける」を押してください。');
            }
        } catch (e) {
            console.error(e);
            alert('状態の更新に失敗しました。');
        } finally {
            this.reloadBusy = false;
        }
    }

    async onLogout(): Promise<void> {
        try {
            await logout();
            void this.router.navigate(['/login']);
        } catch (e) {
            console.error(e);
        }
    }
}
