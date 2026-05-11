import { Component } from '@angular/core'
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { logout, signUp } from '../auth';
import { firebaseAuthErrorMessage } from '../utils/firebase-auth-message';
import { AddUserInput } from '../types/user';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

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
            const user = await this.addUserToAuth(this.email, this.password, this.username);
            await this.addUserToFirestore(user.uid, this.email, this.username);
            await logout();
            await this.router.navigate(['/login'], {
                queryParams: { emailVerification: 'sent' },
            });
        } catch (error) {
            console.error('登録失敗', error);
            alert(firebaseAuthErrorMessage(error));
        }
    }

    // Authにユーザーを追加
    async addUserToAuth(email: string, password: string, username: string) {
        /** 確認メールは auth.signUp 内の sendVerificationEmail のみ（二重送信で too-many-requests になりやすいためここでは送らない） */
        const userCredential = await signUp(email, password, username);
        return userCredential.user;
    }

    // Firestoreにユーザーを追加
    async addUserToFirestore(uid: string, email: string, username: string) {
        try {
            const user: AddUserInput = {
                email: email,
                userName: username,
                photoURL: null,
            }
            const userRef = doc(db, 'users', uid);
            await setDoc(userRef, {
                ...user,
                createdAt: new Date(),
            });
        } catch (error) {
            throw error;
        }
    }
}

