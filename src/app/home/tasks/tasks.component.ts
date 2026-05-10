import { Component, HostListener, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TasksService } from '../../services/tasks.service';
import { CommonModule } from '@angular/common';
import { ModalService } from '../../services/modal.service';
import { AddTaskInput, FilterKey, SortKey, Task } from '../../types/task';
import { AuthStateService } from '../../services/auth-state.service';
import { AuthService } from '../../services/auth.service';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { deleteChildrenTask, updateTask } from '../../firestore';
import { isTaskCreator } from '../../utils/task-permissions';

@Component({
    selector: 'app-tasks',
    templateUrl: './tasks.component.html',
    standalone: true,
    imports: [CommonModule, DragDropModule],
})

export class TaskComponent {
  modalService = inject(ModalService);
  tasksService = inject(TasksService);
  authState = inject(AuthStateService);
  authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  displayFormat: 'list' | 'board' | 'calendar' = 'list';

  selectedTaskIds: string[] = [];

  // カレンダー
  weekDates: Date[] = [];
  currentDate = new Date();
  /** ガント行の高さ（getTaskTop と一致） */
  readonly calendarRowHeightPx = 48;
  /** ヘッダー列（曜日・日付）の下からタスク層までのオフセット（tasks.component.html の .task-layer top と一致） */
  readonly calendarHeaderBandPx = 65;

  // メニュー
  isSortMenuOpen: boolean = false;
  isFilterMenuOpen: boolean = false;
  isSelectedSort: boolean = false;

  constructor() {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe((pm) => {
        this.tasksService.syncMyTasksProfileListModeFromQuery(
          pm.get('view'),
        );
      });
  }

  ngOnInit() {
    this.weekDates = this.getWeekDates(this.currentDate);

    this.authService.watchAuthState(user => {
      if(user) {
        this.tasksService.loadMainTasks();
      } else {
        this.tasksService.clearTasks();
      }
    })
  }

  /** プロフィールからの絞り込み表示中の説明文言 */
  profileViewBannerLabel(): string | null {
    switch (this.tasksService.myTasksProfileListMode()) {
      case 'assigned':
        return '自身が担当に設定されている課題のみ表示しています。';
      case 'notDone':
        return '未完了の課題のみ表示しています。';
      case 'done':
        return '完了済みの課題のみ表示しています。';
      case 'dueSoon':
        return '期限が近い未完了課題のみ表示しています（期日まで2日以内）。';
      case 'overdue':
        return '期限を過ぎた未完了課題のみ表示しています。';
      default:
        return null;
    }
  }

  clearProfileListView(): void {
    this.tasksService.clearMyTasksProfileListMode();
    void this.router.navigate(['/home/tasks'], { replaceUrl: true });
  }

  /** プロフィール由来の「完了のみ」では未完了テーブルを出さない */
  showMyTasksNotDoneSection(): boolean {
    return this.tasksService.myTasksProfileListMode() !== 'done';
  }

  /** 未完了・期限系の絞り込みでは完了ブロックを出さない */
  showMyTasksDoneSection(): boolean {
    const m = this.tasksService.myTasksProfileListMode();
    return m !== 'notDone' && m !== 'dueSoon' && m !== 'overdue';
  }

  openTaskModal(type: 'task-edit' | 'task-add', task: any) {
    this.modalService.open(type, task);
  }

  isTaskCreatorTask(task: Task): boolean {
    return isTaskCreator(task, this.authState.uid);
  }

  /** 一括選択・削除の対象（作成者のみ） */
  deletableDisplayedTasks(status: 'notDone' | 'done' | null = null): Task[] {
    return this.displayTasks(status).filter((t) => this.isTaskCreatorTask(t));
  }

  async dropTask(event: CdkDragDrop<Task[]>) {
    if(event.previousContainer === event.container) {
      return;
    }
    const movedTask = event.previousContainer.data[event.previousIndex];
    if (!this.isTaskCreatorTask(movedTask)) {
      return;
    }
    const newStatus = event.container.id as Task['status'];

    this.tasksService.tasks.update(tasks =>
      tasks.map(task =>
        task.id === movedTask.id ? { ...task, status: newStatus } : task
      )
    );

    // Firestoreに更新
    try {
      const inputTask: AddTaskInput = {
        ...movedTask,
        status: newStatus,
      }
      await updateTask(movedTask.id, inputTask);
    } catch (error) {
      console.error("タスクステータス更新失敗: ", error);
    }
  }

  onRowCheckboxChange(taskId: string, checked: boolean) {
    const task = this.tasksService.tasks().find((t) => t.id === taskId);
    if (!task || !this.isTaskCreatorTask(task)) return;
    if (checked) {
      if (!this.selectedTaskIds.includes(taskId)) {
        this.selectedTaskIds = [...this.selectedTaskIds, taskId];
      }
    } else {
      this.selectedTaskIds = this.selectedTaskIds.filter((id) => id !== taskId);
    }
  }

  isAllDisplayedSelected(): boolean {
    const deletable = this.deletableDisplayedTasks('notDone');
    return (
      deletable.length > 0 &&
      deletable.every((t) => this.selectedTaskIds.includes(t.id))
    );
  }

  onToggleSelectAll(checked: boolean) {
    const ids = this.deletableDisplayedTasks('notDone').map((t) => t.id);
    if (checked) {
      this.selectedTaskIds = [...new Set([...this.selectedTaskIds, ...ids])];
    } else {
      const drop = new Set(ids);
      this.selectedTaskIds = this.selectedTaskIds.filter((id) => !drop.has(id));
    }
  }

  async deleteSelectedTask() {
    if (this.selectedTaskIds.length === 0) return;
    const uid = this.authState.uid;
    const allIds = [...this.selectedTaskIds];
    const allowed = allIds.filter((id) => {
      const t = this.tasksService.tasks().find((x) => x.id === id);
      return t && isTaskCreator(t, uid);
    });
    if (allowed.length === 0) {
      window.alert('選択した課題のうち、削除できるのは作成した課題のみです。');
      return;
    }
    if (allowed.length < allIds.length) {
      window.alert('作成者のみ削除できるため、該当する課題のみ削除します。');
    }
    try {
      for (const taskId of allowed) {
        await deleteChildrenTask(taskId);
        this.tasksService.deleteTask(taskId);
      }
      this.selectedTaskIds = [];
    } catch (error) {
      console.error('タスク一括削除失敗: ', error);
    }
  }

  // 画面に表示するタスク
  displayTasks(status: 'notDone' | 'done' | null = null) {
    return this.tasksService.getDisplayTasks(status);
  }

  // ソート・フィルター
  toggleSortMenu() {
    if(this.isSortMenuOpen) {
      this.isSortMenuOpen = false;
    } else {
      this.isFilterMenuOpen = false;
      this.tasksService.closeAllFilterMenus();
      this.isSortMenuOpen = true;
    }
  }
  toggleFilterMenu() {
    if(this.isFilterMenuOpen) {
      this.isFilterMenuOpen = false;
    } else {
      this.isSortMenuOpen = false;
      this.tasksService.closeAllFilterMenus();
      this.isFilterMenuOpen = true;
    }
  }
  selectSort(sortKey: SortKey) {
    this.tasksService.sortKey = sortKey;
    this.isSortMenuOpen = false;
    this.isSelectedSort = true;
  }
  selectFilter(filterKey: FilterKey) {
    this.tasksService.filterKey = filterKey;
    this.isFilterMenuOpen = false;
  }
  clearSort() {
    this.tasksService.sortKey = null;
    this.closeSortAndFilterMenu();
  }
  closeSortAndFilterMenu() {
    this.isSortMenuOpen = false;
    this.isFilterMenuOpen = false;
  }

  closeAllMenus() {
    this.closeSortAndFilterMenu();
    this.tasksService.closeAllFilterMenus();
  }

  @HostListener('document:click')
  onDocumentClick() {
    this.closeAllMenus();
  }
  getSortLabel(sortKey: SortKey) {
    switch(sortKey) {
      case 'dueDate':
        return '期日';
      case 'createdAt':
        return '作成日';
      case 'updatedAt':
        return '最終変更日';
      default:
        return '';
    }
  }


  // 期限の状態を取得
  getDueDateStatus(dueDate: string | null, taskStatus: string) {
      if(taskStatus === '完了') return '';
      if(!dueDate) return '';

      const today = new Date();
      const due = new Date(dueDate);

      today.setHours(0, 0, 0, 0);
      due.setHours(0, 0, 0, 0);

      const diff = (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);

      if(diff < 0) {
      return 'overdue';
      }

      if(diff <= 2) {
      return 'near';
      }

      return '';
  }

  /** ボードカード用の期間ラベル（未設定はプレースホルダ） */
  boardDateRangeLabel(task: Task): string {
    const a = (task.startDate ?? '').toString().trim();
    const b = (task.dueDate ?? '').toString().trim();
    if (!a && !b) {
      return '期間未設定';
    }
    if (a && b) {
      return `${a} 〜 ${b}`;
    }
    if (b) {
      return `期限 ${b}`;
    }
    return `開始 ${a}`;
  }

  /** 進捗セル用ピル */
  progressPillClass(status: string): string {
    switch (status) {
      case '未着手':
        return 'task-pill task-pill--todo';
      case '進行中':
        return 'task-pill task-pill--progress';
      case '保留':
        return 'task-pill task-pill--hold';
      case '完了':
        return 'task-pill task-pill--done';
      default:
        return 'task-pill';
    }
  }

  /** 優先度セル用ピル */
  priorityPillClass(priority: string | null): string {
    if (priority === '高') return 'task-pill task-pill--pri-high';
    if (priority === '中') return 'task-pill task-pill--pri-medium';
    if (priority === '低') return 'task-pill task-pill--pri-low';
    return 'task-pill task-pill--pri-none';
  }

  /** タグセル用ピル */
  tagPillClass(color: string): string {
    return `task-pill task-pill--tag-${color}`;
  }

  // カレンダー
  getWeekDates(baseDate: Date): Date[] {
      const date = new Date(baseDate);
      const day = date.getDay();

      date.setDate(date.getDate() -day);

      const dates: Date[] = [];

      for (let i=0; i<7; i++) {
          const d = new Date(date);
          d.setDate(date.getDate() + i);
          dates.push(d);
      }

      return dates;
  }
  getDayName(date: Date): string {
      const days = ['月', '火', '水', '木', '金', '土', '日'];
      return days[date.getDay()];
  }
  prevWeek() {
      const newDate = new Date(this.currentDate);
      newDate.setDate(newDate.getDate() - 7);

      this.currentDate = newDate;
      this.weekDates = this.getWeekDates(this.currentDate);
  }
  nextWeek() {
      const newDate = new Date(this.currentDate);
      newDate.setDate(newDate.getDate() + 7);

      this.currentDate = newDate;
      this.weekDates = this.getWeekDates(this.currentDate);
  }
  // 今日の日付に移動
  today() {
      const newDate = new Date();
      
      this.currentDate = newDate;
      this.weekDates = this.getWeekDates(this.currentDate);
  }
  // 今日の日付かどうかの判定
  isToday(date: Date): boolean {
      const today = new Date();

      return (
          date.getFullYear() === today.getFullYear() &&
          date.getMonth() === today.getMonth() &&
          date.getDate() === today.getDate()
      );
  }
  formatDate(date: Date): string {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');

      return `${year}-${month}-${day}`;
  }
  getWeekTasks() {
    if (this.weekDates.length === 0) return [];
  
    const weekStart = this.formatDate(this.weekDates[0]);
    const weekEnd = this.formatDate(this.weekDates[6]);
  
    return this.tasksService.tasks().filter(task => {
      if(!task.startDate || !task.dueDate) return false;
      return task.startDate <= weekEnd && task.dueDate >= weekStart;
    });
  }

  /** 週内かつ一覧（未完了・フィルター）に載るタスク。カレンダー描画と行計算の単一ソース */
  getCalendarWeekTasks(): Task[] {
    const displayedIds = new Set(
      this.displayTasks('notDone').map(t => t.id),
    );
    return this.getWeekTasks().filter(t => displayedIds.has(t.id));
  }

  getTaskStartIndex(task: Task): number {
    if(!task.startDate) return 0;
    const weekStart = this.formatDate(this.weekDates[0]);
  
    if (task.startDate <= weekStart) {
      return 0;
    }
  
    return this.weekDates.findIndex(date => this.formatDate(date) === task.startDate);
  }
  getTaskLeftPercent(task: Task): number {
    const startIndex = this.getTaskStartIndex(task);
    return (startIndex / 7) * 100;
  }
  getTaskEndIndex(task: Task): number {
    if(!task.dueDate) return 0;
    const weekEnd = this.formatDate(this.weekDates[6]);
  
    if (task.dueDate >= weekEnd) {
      return 6;
    }
  
    return this.weekDates.findIndex(date => this.formatDate(date) === task.dueDate);
  }
  getTaskWidthPercent(task: Task): number {
    const startIndex = this.getTaskStartIndex(task);
    const endIndex = this.getTaskEndIndex(task);
    const spanDays = endIndex - startIndex + 1;
  
    return (spanDays / 7) * 100;
  }
  sortedWeekTasks() {
    return [...this.getCalendarWeekTasks()].sort((a, b) => {
      if (a.startDate && b.startDate && a.startDate !== b.startDate) {
        return a.startDate.localeCompare(b.startDate);
      }
  
      if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) {
        return a.dueDate.localeCompare(b.dueDate);
      }
  
      return a.id.localeCompare(b.id);
    });
  }
  getTaskRow(task: { id: string }) {
    return this.sortedWeekTasks().findIndex(t => t.id === task.id);
  }
  getTaskTop(task: { id: string }) {
    const row = this.getTaskRow(task);
    return row * this.calendarRowHeightPx;
  }

  /** 週内タスク件数に合わせてボードの高さを確保（下の行が隠れないようにする） */
  getCalendarBoardMinHeight(): number {
    const rows = this.sortedWeekTasks().length;
    const taskBand = rows * this.calendarRowHeightPx + 24;
    const bodyFloor = 220;
    return Math.max(320, this.calendarHeaderBandPx + Math.max(bodyFloor, taskBand));
  }
}