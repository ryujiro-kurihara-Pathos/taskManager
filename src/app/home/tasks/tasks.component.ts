import { Component, inject } from '@angular/core';
import { TasksService } from '../../services/tasks.service';
import { CommonModule } from '@angular/common';
import { ModalService } from '../../services/modal.service';
import { AddTaskInput, FilterKey, SortKey, Task } from '../../types/task';
import { AuthStateService } from '../../services/auth-state.service';
import { AuthService } from '../../services/auth.service';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { updateTask } from '../../firestore';

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

  displayFormat: 'list' | 'board' | 'calendar' = 'list';

  selectedTaskIds: string[] = [];

  // カレンダー
  weekDates: Date[] = [];
  currentDate = new Date();

  // メニュー
  isSortMenuOpen: boolean = false;
  isFilterMenuOpen: boolean = false;
  isSelectedSort: boolean = false;

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

  openTaskModal(type: 'task-edit' | 'task-add', task: any) {
    this.modalService.open(type, task);
  }

  async dropTask(event: CdkDragDrop<Task[]>) {
    if(event.previousContainer === event.container) {
      return;
    }
    const movedTask = event.previousContainer.data[event.previousIndex];
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

  // タスク選択
  toggleTaskSelection(taskId: string) {
      // if(this.selectedTaskIds.includes(taskId)) {
      // this.selectedTaskIds = this.selectedTaskIds.filter(id => id !== taskId);
      // } else {
      // this.selectedTaskIds.push(taskId);
      // }
  }
  // タスク一括削除
  async deleteSelectedTask() {
      try {
      for(const taskId of this.selectedTaskIds) {
          // await deleteTask(taskId);
      }

      // await this.loadMainTasks();
      this.selectedTaskIds = [];
      } catch (error) {
      console.error("タスク一括削除失敗: ", error);
      }
  }

  // 画面に表示するタスク
  displayTasks(status: 'notDone' | 'done') {
    return this.tasksService.getDisplayTasks(status);
  }

  // ソート・フィルター
  toggleSortMenu() {
    if(this.isSortMenuOpen) {
      this.isSortMenuOpen = false;
    } else {
      this.isFilterMenuOpen = false;
      this.isSortMenuOpen = true;
    }
  }
  toggleFilterMenu() {
    if(this.isFilterMenuOpen) {
      this.isFilterMenuOpen = false;
    } else {
      this.isSortMenuOpen = false;
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
  dummyTasks = [
    { id: '1', title: '買い物', startDate: '2026-04-20', dueDate: '2026-04-20' },
    { id: '2', title: '課題提出', startDate: '2026-04-20', dueDate: '2026-04-22' },
    { id: '3', title: 'MTG', startDate: '2026-04-22', dueDate: '2026-04-24' },
    { id: '4', title: 'テスト', startDate: new Date().toISOString().split('T')[0], dueDate: '2026-05-01' },
  ];
  getWeekTasks() {
    if (this.weekDates.length === 0) return [];
  
    const weekStart = this.formatDate(this.weekDates[0]);
    const weekEnd = this.formatDate(this.weekDates[6]);
  
    return this.dummyTasks.filter(task => {
      return task.startDate <= weekEnd && task.dueDate >= weekStart;
    });
  }
  getTaskStartIndex(task: { startDate: string; dueDate: string }): number {
    const weekStart = this.formatDate(this.weekDates[0]);
  
    if (task.startDate <= weekStart) {
      return 0;
    }
  
    return this.weekDates.findIndex(date => this.formatDate(date) === task.startDate);
  }
  getTaskLeftPercent(task: { startDate: string; dueDate: string }): number {
    const startIndex = this.getTaskStartIndex(task);
    return (startIndex / 7) * 100;
  }
  getTaskEndIndex(task: { startDate: string; dueDate: string }): number {
    const weekEnd = this.formatDate(this.weekDates[6]);
  
    if (task.dueDate >= weekEnd) {
      return 6;
    }
  
    return this.weekDates.findIndex(date => this.formatDate(date) === task.dueDate);
  }
  getTaskWidthPercent(task: { startDate: string; dueDate: string }): number {
    const startIndex = this.getTaskStartIndex(task);
    const endIndex = this.getTaskEndIndex(task);
    const spanDays = endIndex - startIndex + 1;
  
    return (spanDays / 7) * 100;
  }
  sortedWeekTasks() {
    return [...this.getWeekTasks()].sort((a, b) => {
      if (a.startDate !== b.startDate) {
        return a.startDate.localeCompare(b.startDate);
      }
  
      if (a.dueDate !== b.dueDate) {
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
    return row * 48;
  }
}