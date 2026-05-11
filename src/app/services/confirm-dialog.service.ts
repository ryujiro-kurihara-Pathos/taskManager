import { Injectable, signal } from '@angular/core';

export type ConfirmDialogOpenOptions = {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
};

export type ConfirmDialogPayload = {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
};

@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  readonly state = signal<ConfirmDialogPayload | null>(null);

  private resolveFn: ((v: boolean) => void) | null = null;

  /** プロフィールのログアウト確認と同様のオーバーレイで Yes/No を返す */
  confirm(options: ConfirmDialogOpenOptions): Promise<boolean> {
    if (this.resolveFn) {
      this.resolveFn(false);
      this.resolveFn = null;
    }
    return new Promise((resolve) => {
      this.resolveFn = resolve;
      this.state.set({
        title: options.title,
        message: options.message ?? '',
        confirmText: options.confirmText ?? 'はい',
        cancelText: options.cancelText ?? 'いいえ',
      });
    });
  }

  cancel(): void {
    this.state.set(null);
    const r = this.resolveFn;
    this.resolveFn = null;
    r?.(false);
  }

  accept(): void {
    this.state.set(null);
    const r = this.resolveFn;
    this.resolveFn = null;
    r?.(true);
  }
}
