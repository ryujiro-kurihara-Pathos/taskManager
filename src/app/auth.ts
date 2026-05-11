import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    updateProfile,
    onAuthStateChanged,
    signOut,
    sendEmailVerification,
    type User,
} from "firebase/auth";
import { auth } from "./firebase";

function getFirebaseAuthErrorCode(error: unknown): string {
    if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof (error as { code: unknown }).code === "string"
    ) {
        return (error as { code: string }).code;
    }
    return "";
}

/** 直前の送信でメールは届いている可能性があるため、登録フローを止めない */
function isTooManyRequestsOnVerification(error: unknown): boolean {
    return getFirebaseAuthErrorCode(error) === "auth/too-many-requests";
}

function verificationContinueUrl(): string | undefined {
    if (typeof window === "undefined") return undefined;
    return `${window.location.origin}/login`;
}

/**
 * ログイン済みユーザーに確認メールを送る（再送・初回登録後に利用）。
 * continueUrl が承認済みドメインに含まれない環境（例: 127.0.0.1 のみ登録）では
 * Firebase 既定の完了ページ用に第2引数なしで再試行する。
 */
export async function sendVerificationEmail(user: User): Promise<void> {
    const url = verificationContinueUrl();
    if (url) {
        try {
            await sendEmailVerification(user, {
                url,
                handleCodeInApp: false,
            });
            return;
        } catch (e: unknown) {
            const code = getFirebaseAuthErrorCode(e);
            if (code === "auth/unauthorized-continue-uri" || code === "auth/invalid-continue-uri") {
                try {
                    await sendEmailVerification(user);
                    return;
                } catch (e2: unknown) {
                    if (isTooManyRequestsOnVerification(e2)) {
                        console.warn(
                            "[auth] sendEmailVerification: auth/too-many-requests（続行URLなしの再試行）。直前の送信で確認メールは届いている可能性があります。",
                        );
                        return;
                    }
                    throw e2;
                }
            }
            if (isTooManyRequestsOnVerification(e)) {
                console.warn(
                    "[auth] sendEmailVerification: auth/too-many-requests。直前の送信で確認メールは届いている可能性があります。",
                );
                return;
            }
            throw e;
        }
    }
    try {
        await sendEmailVerification(user);
    } catch (e: unknown) {
        if (isTooManyRequestsOnVerification(e)) {
            console.warn(
                "[auth] sendEmailVerification: auth/too-many-requests。直前の送信で確認メールは届いている可能性があります。",
            );
            return;
        }
        throw e;
    }
}

// 登録機能
export async function signUp(email: string, password: string, username: string) {
    try {
        const userCredential = await createUserWithEmailAndPassword(
            auth,
            email,
            password,
        );

        await updateProfile(userCredential.user, {
            displayName: username
        });

        await sendVerificationEmail(userCredential.user);

        console.log("登録成功:", userCredential.user);
        return userCredential;
    } catch (error) {
        console.error("登録失敗:", error);
        throw error;
    }
}

// ログイン機能
export async function login(email: string, password: string) {
    try {
        const userCredential = await signInWithEmailAndPassword(
            auth,
            email,
            password,
        );

        console.log("ログイン成功:", userCredential.user);
        return userCredential;
    } catch (error) {
        console.error("ログイン失敗:", error);
        throw error;
    }
}

// ログアウト
export async function logout() {
    try {
        await signOut(auth);
        console.log("ログアウト成功");
    } catch (error) {
        console.error("ログアウト失敗", error);
        throw error;
    }
}

/** @returns 購読を解除する関数 */
export function watchAuthState(callback: (user: any) => void): () => void {
    return onAuthStateChanged(auth, (user) => {
        callback(user);
    });
}

// ユーザー名更新
export async function updateUserName(userName: string) {
    try {
        if(!auth.currentUser) {
            throw new Error("ログイン中のユーザーがいません");
        }
        
        await updateProfile(auth.currentUser, {
            displayName: userName
        });
    } catch (error) {
        throw error;
    }
}