import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (dialog.state(); as s) {
      <div
        class="confirm-dialog-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        (click)="dialog.cancel()"
      >
        <div class="confirm-dialog-panel" (click)="$event.stopPropagation()">
          <h2 id="confirm-dialog-title" class="confirm-dialog-title">
            {{ s.title }}
          </h2>
          @if (s.message) {
            <p class="confirm-dialog-message">{{ s.message }}</p>
          }
          <div class="confirm-dialog-actions">
            <button
              type="button"
              class="confirm-dialog-btn confirm-dialog-btn--no"
              (click)="dialog.cancel()"
            >
              {{ s.cancelText }}
            </button>
            <button
              type="button"
              class="confirm-dialog-btn confirm-dialog-btn--yes"
              (click)="dialog.accept()"
            >
              {{ s.confirmText }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
    .confirm-dialog-overlay {
      position: fixed;
      inset: 0;
      z-index: 1200;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      box-sizing: border-box;
      background: rgba(0, 0, 0, 0.45);
    }
    .confirm-dialog-panel {
      width: min(100%, 400px);
      padding: 22px 20px 20px;
      background: #fff;
      border-radius: 12px;
      border: 1px solid #e5e7eb;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.18);
      box-sizing: border-box;
    }
    .confirm-dialog-title {
      margin: 0 0 10px;
      font-size: 18px;
      font-weight: 700;
      color: #111827;
    }
    .confirm-dialog-message {
      margin: 0 0 20px;
      font-size: 14px;
      color: #4b5563;
      line-height: 1.55;
      white-space: pre-wrap;
    }
    .confirm-dialog-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      justify-content: flex-end;
    }
    .confirm-dialog-btn {
      font-size: 14px;
      font-weight: 500;
      padding: 8px 16px;
      border-radius: 8px;
      cursor: pointer;
      border: none;
    }
    .confirm-dialog-btn--no {
      border: 1px solid #c8ccc9;
      background: #f9fafb;
      color: #333;
    }
    .confirm-dialog-btn--no:hover {
      background: #ebf1ee;
    }
    .confirm-dialog-btn--yes {
      background: #b3261e;
      color: #fff;
      font-weight: 600;
    }
    .confirm-dialog-btn--yes:hover {
      background: #8f1e18;
    }
  `,
  ],
})
export class ConfirmDialogComponent {
  readonly dialog = inject(ConfirmDialogService);
}
