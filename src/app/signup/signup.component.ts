import { Component } from '@angular/core'
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { signUp } from '../auth';

@Component({
    selector: 'app-signup',
    standalone: true,
    imports: [FormsModule, RouterLink],
    templateUrl: './signup.component.html',
})

export class SignupComponent {
    email: string = '';
    password: string = '';
    username: string = '';

    constructor(private router: Router) {}

    async onSignUp() {
        try {
            await signUp(this.email, this.password, this.username);
            console.log("登録成功");
            await this.router.navigate(['/home']);
        } catch (error) {
            console.error("登録失敗", error);
        }
    }
}

