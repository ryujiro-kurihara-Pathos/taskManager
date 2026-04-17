import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { login } from '../auth';

@Component({
    selector: 'app-login',
    imports: [ FormsModule, RouterLink ],
    templateUrl: './login.component.html'
})

export class LoginComponent {
    email: string = '';
    password: string = '';

    constructor(private router: Router){}

    async onLogin() {
        try {
            await login(this.email, this.password);
            console.log('ログイン成功');
            await this.router.navigate(['/home']);
        } catch (error) {
            console.error('ログイン失敗', error);
            alert('ログインに失敗しました');
        }
    }
}