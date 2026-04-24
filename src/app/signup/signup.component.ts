import { Component } from '@angular/core'
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { signUp } from '../auth';
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
            await this.addUserToFirestore(user.uid, this.email, this.password, this.username);
            await this.router.navigate(['/home']);
        } catch (error) {
            console.error("登録失敗", error);
        }
    }

    // Authにユーザーを追加
    async addUserToAuth(email: string, password: string, username: string) {
        try {
            const userCredential = await signUp(email, password, username);
            return userCredential.user;
        } catch (error) {
            throw error;
        }
    }

    // Firestoreにユーザーを追加
    async addUserToFirestore(uid: string, email: string, password: string, username: string) {
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

