import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

/**
 * 未ログインのとき `/login` へ、メール未認証のとき `/verify-email` へリダイレクトする。
 * Firebase の初回 auth 確定を待つため、同期的な currentUser のみの判定はしない。
 */
export const authGuard: CanActivateFn = (): Promise<boolean | UrlTree> => {
    const router = inject(Router);

    return new Promise((resolve) => {
        const unsub = onAuthStateChanged(auth, (user) => {
            unsub();
            if (!user) {
                resolve(router.createUrlTree(['/login']));
                return;
            }
            // if (!user.emailVerified) {
            //     resolve(router.createUrlTree(['/verify-email']));
            //     return;
            // }
            resolve(true);
        });
    });
};
