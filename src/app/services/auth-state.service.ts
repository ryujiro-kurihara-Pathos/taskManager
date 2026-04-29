import { Injectable, signal } from '@angular/core';
import { User } from '../types/user';

// アプリ全体で使えるようにする
@Injectable({
    providedIn: 'root'
})
export class AuthStateService {
    user = signal<User | null | undefined>(undefined);

    setUser(user: User | null) {
        this.user.set(user);
    }

    clearUser() {
        this.user.set(null);
    }

    get isLoggedIn(): boolean {
        return this.user() !== null;
    }

    get uid(): string {
        return this.user()?.id ?? '';
    }

    get email(): string {
        return this.user()?.email ?? '';
    }

    get userName(): string {
        return this.user()?.userName ?? '';
    }
}