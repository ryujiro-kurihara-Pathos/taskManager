/** プロフィールアイコン等に使うユーザー名の先頭1文字（未設定は ?） */
export function userAvatarInitial(userName: string | null | undefined): string {
    const t = (userName ?? '').trim();
    if (!t) return '?';
    const first = [...t][0];
    return first ?? '?';
}
