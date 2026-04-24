import { Injectable, inject } from '@angular/core';
import { User, getAuth, onAuthStateChanged } from 'firebase/auth';
import { AuthStateService } from './auth-state.service';

@Injectable({
    providedIn: 'root'
})

export class AuthService {
    private auth = getAuth();
    private authState = inject(AuthStateService);

    constructor() {
        onAuthStateChanged(this.auth, (user: User | null) => {
            const uid = user?.uid;
            if (!uid) return;
            this.authState.setUser({
                id: uid,
                email: user?.email ?? '',
                userName: user?.displayName ?? '',
                photoURL: user?.photoURL ?? null,
                createdAt: user?.metadata.creationTime ?? '',
            });
        });
    }
}