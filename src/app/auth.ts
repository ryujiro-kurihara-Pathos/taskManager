import { 
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    updateProfile,
    onAuthStateChanged,
    signOut,
} from "firebase/auth";
import { auth } from "./firebase";

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

// ユーザーの状態を監視
export function watchAuthState(callback: (user: any) => void) {
    onAuthStateChanged(auth, (user) => {
        callback (user);
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