import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { login } from '../auth';
import { firebaseLoginErrorMessage } from '../utils/firebase-auth-message';

@Component({
    selector: 'app-login',
    standalone: true,
    imports: [FormsModule, RouterLink],
    templateUrl: './login.component.html',
})
export class LoginComponent implements OnInit {
    email: string = '';
    password: string = '';
    showSignupVerificationNotice = false;

    constructor(
        private router: Router,
        private route: ActivatedRoute,
    ) {}

    ngOnInit(): void {
        this.showSignupVerificationNotice =
            this.route.snapshot.queryParamMap.get('emailVerification') === 'sent';
    }

    async onLogin() {
        try {
            const cred = await login(this.email, this.password);
            if (!cred.user.emailVerified) {
                await this.router.navigate(['/verify-email']);
                return;
            }
            await this.router.navigate(['/home']);
        } catch (error) {
            console.error('ログイン失敗', error);
            alert(firebaseLoginErrorMessage(error));
        }
    }
}