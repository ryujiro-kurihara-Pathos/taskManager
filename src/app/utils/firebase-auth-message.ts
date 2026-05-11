export type FirebaseAuthErrorContext = 'signup' | 'oob';

/** Firebase Auth / 周辺でよくある code をユーザー向け文言に変換する */
export function firebaseAuthErrorMessage(
    error: unknown,
    context: FirebaseAuthErrorContext = 'signup',
): string {
    const code =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof (error as { code: unknown }).code === 'string'
            ? (error as { code: string }).code
            : '';

    const oobPrefix = context === 'oob' ? '確認メールを送信できませんでした' : '登録に失敗しました';

    switch (code) {
        case 'auth/email-already-in-use':
            return 'このメールアドレスは既に登録されています。ログインするか、Firebase コンソールでユーザーを削除してから再度お試しください。';
        case 'auth/invalid-email':
            return 'メールアドレスの形式が正しくありません。';
        case 'auth/weak-password':
            return 'パスワードは 6 文字以上にしてください。';
        case 'auth/operation-not-allowed':
            return 'メール／パスワードでの登録が無効です。Firebase コンソールの「Authentication」→「ログイン方法」で有効化してください。';
        case 'auth/network-request-failed':
            return 'ネットワークエラーです。接続を確認してから再度お試しください。';
        case 'auth/too-many-requests':
            return '試行回数が多すぎます。しばらく待ってから再度お試しください。';
        case 'auth/unauthorized-continue-uri':
        case 'auth/invalid-continue-uri':
            return '続行先URLが承認済みドメインに含まれていません。Firebase コンソールの「Authentication」→「設定」→「承認済みドメイン」に、このアプリのオリジン（例: localhost、127.0.0.1、本番URL）を追加してください。';
        case 'permission-denied':
            return 'ユーザー情報の保存が許可されていません（Firestore のセキュリティルールを確認してください）。';
        default:
            if (code.startsWith('auth/')) {
                return `${oobPrefix}（${code}）。時間をおいて再度お試しください。`;
            }
            return `${oobPrefix}。時間をおいて再度お試しください。`;
    }
}

export function firebaseLoginErrorMessage(error: unknown): string {
    const code =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof (error as { code: unknown }).code === 'string'
            ? (error as { code: string }).code
            : '';

    switch (code) {
        case 'auth/invalid-email':
            return 'メールアドレスの形式が正しくありません。';
        case 'auth/user-disabled':
            return 'このアカウントは無効化されています。';
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
            return 'メールアドレスまたはパスワードが正しくありません。';
        case 'auth/network-request-failed':
            return 'ネットワークエラーです。接続を確認してから再度お試しください。';
        case 'auth/too-many-requests':
            return '試行回数が多すぎます。しばらく待ってから再度お試しください。';
        default:
            if (code.startsWith('auth/')) {
                return `ログインに失敗しました（${code}）。`;
            }
            return 'ログインに失敗しました。';
    }
}
