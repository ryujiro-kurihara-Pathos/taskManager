import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
    getProject,
    getProjectMembers,
    getUser,
    updateTask,
    deleteChildrenTask,
} from '../../firestore';
import { Project } from '../../types/project';
import { getTasksByProjectId } from '../../firestore';
import { AddTaskInput, SortKey, Task } from '../../types/task';
import { FormsModule } from '@angular/forms';
import { addTask } from '../../firestore';
import { AuthStateService } from '../../services/auth-state.service';
import { ModalService } from '../../services/modal.service';
import { CommonModule } from '@angular/common';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';

@Component({
    selector: 'app-project-detail',
    templateUrl: './project-detail.component.html',
    imports: [FormsModule, CommonModule, DragDropModule],
})

export class ProjectDetailComponent {
    constructor(private modalService: ModalService, private router: Router) {}

    private route = inject(ActivatedRoute);
    authStateService = inject(AuthStateService);

    // ヘッダー
    // 表示形式
    displayFormat: 'list' | 'board' | 'calendar' = 'list';

    // メイン
    projectId = this.route.snapshot.paramMap.get('projectId');
    project: Project | null = null;
    /** プロジェクト内タスク（ボード CDK 用に signal） */
    tasks = signal<Task[]>([]);
    readonly boardTodos = computed(() =>
        this.tasks().filter((t) => t.status === '未着手'),
    );
    readonly boardInProgress = computed(() =>
        this.tasks().filter((t) => t.status === '進行中'),
    );
    readonly boardOnHold = computed(() =>
        this.tasks().filter((t) => t.status === '保留'),
    );
    readonly boardDone = computed(() =>
        this.tasks().filter((t) => t.status === '完了'),
    );
    newTaskTitle: string = '';

    // リスト（tasks.component と同様。TasksService は共有しない）
    selectedTaskIds: string[] = [];
    listSearchQuery = signal('');
    listSortKey: SortKey = null;
    isSortMenuOpen = false;
    isSelectedSort = false;
    priorityFilter: '高' | '中' | '低' | '未設定' | null = null;
    isPriorityFilterOpen = false;
    progressFilter: '未着手' | '進行中' | '保留' | '完了' | null = null;
    isProgressFilterOpen = false;
    dueDateFilter: '今日' | '明日' | '1週間' | '未設定' | null = null;
    isDueDateFilterOpen = false;

    // カレンダー
    weekDates: Date[] = [];
    currentDate = new Date();
    /** ガント行の高さ（getTaskTop と一致） */
    readonly calendarRowHeightPx = 48;
    /** ヘッダー列（曜日・日付）の下からタスク層までのオフセット（tasks.component.html の .task-layer top と一致） */
    readonly calendarHeaderBandPx = 65;

    async ngOnInit() {
        this.weekDates = this.getWeekDates(this.currentDate);
        if(!this.projectId) return;
        // プロジェクトを取得
        this.project = await this.getProject(this.projectId);
        if(!this.project) return;
        // プロジェクトタスクを取得
        this.tasks.set(await this.getTasksByProjectId(this.projectId));

        // プロジェクトメンバーを取得
        const projectMembers = await this.getProjectMembers(this.projectId);
        this.project.projectMembers = projectMembers;
    }

    openProjectEditModal(project: Project) {
        this.modalService.open('project-edit', project);
    }

    openMemberListModal(project: Project) {
        this.modalService.open('project-member-list', project);
    }

    // タスク追加モーダルを開く
    openTaskAddModal(project: Project) {
        this.modalService.open('project-add-task', project);
    }

    closeTaskAddModal() {
        
    }

    openTaskModal(type: 'task-edit' | 'task-add', task: any) {
        this.modalService.open(type, task);
    }

    async dropTask(event: CdkDragDrop<Task[]>) {
        if (event.previousContainer === event.container) {
            return;
        }
        const movedTask = event.previousContainer.data[event.previousIndex];
        const newStatus = event.container.id as Task['status'];

        this.tasks.update((current) =>
            current.map((task) =>
                task.id === movedTask.id ? { ...task, status: newStatus } : task,
            ),
        );

        try {
            const inputTask: AddTaskInput = {
                ...movedTask,
                status: newStatus,
            };
            await updateTask(movedTask.id, inputTask);
        } catch (error) {
            console.error('タスクステータス更新失敗: ', error);
        }
    }

    // ドキュメントIDからプロジェクトを取得
    async getProject(projectId: string) {
        try {
            const project = await getProject(projectId);
            return project;
        } catch (error) {
            console.error('プロジェクトを取得できませんでした', error);
            return null;
        }
    }

    // プロジェクトに所属するタスクを取得
    async getTasksByProjectId(projectId: string) {
        try {
            if(!projectId) return [];

            const tasks = await getTasksByProjectId(projectId);
            return tasks;
        } catch (error) {
            console.error('プロジェクトに所属するタスクを取得できませんでした', error);
            return [];
        }
    }

    // タスクを追加
    async addTask(title: string) {
        try {
            const user = this.authStateService.user();
            if(!user) return;
            const task: AddTaskInput = {
                uid: user.id,
                title: title,
                status: '未着手',
                priority: '中',
                dueDate: null,
                startDate: null,
                memo: null,
                parentTaskId: null,
                projectId: this.projectId,
                assignedUid: null,
                teamId: null,
                tagIds: [],
            }
            const newTask = await addTask(task);
            if (!newTask) return;
            this.tasks.update((current) => [...current, newTask]);
            this.closeTaskAddModal();
        } catch (error) {
            console.error('タスクを追加できませんでした', error);
            return;
        }
    }
    // プロジェクトメンバーを取得
    async getProjectMembers(projectId: string) {
        try {
            const projectMembers = await getProjectMembers(projectId);
            projectMembers.forEach(async (member) => {
                const user = await getUser(member.userId);
                if(!user) return;
                member.user = user;
            });
            return projectMembers;
        } catch (error) {
            console.error('プロジェクトメンバーを取得できませんでした', error);
            return [];
        }
    }

    displayTasks(status: 'notDone' | 'done'): Task[] {
        let list = [...this.tasks()];
        if (status === 'notDone') {
            list = list.filter((t) => t.status !== '完了');
        } else {
            list = list.filter((t) => t.status === '完了');
        }
        if (this.priorityFilter) {
            if (this.priorityFilter === '未設定') {
                list = list.filter((t) => t.priority === null);
            } else {
                list = list.filter((t) => t.priority === this.priorityFilter);
            }
        }
        if (this.progressFilter) {
            list = list.filter((t) => t.status === this.progressFilter);
        }
        if (this.dueDateFilter) {
            if (this.dueDateFilter === '今日') {
                list = list.filter(
                    (t) => t.dueDate && this.isDueDateWithin(t.dueDate, 0),
                );
            } else if (this.dueDateFilter === '明日') {
                list = list.filter(
                    (t) => t.dueDate && this.isDueDateWithin(t.dueDate, 1),
                );
            } else if (this.dueDateFilter === '1週間') {
                list = list.filter(
                    (t) => t.dueDate && this.isDueDateWithin(t.dueDate, 7),
                );
            } else if (this.dueDateFilter === '未設定') {
                list = list.filter((t) => t.dueDate === null);
            }
        }
        if (this.listSortKey) {
            list.sort((a, b) => {
                if (this.listSortKey === 'dueDate') {
                    const aTime = a.dueDate
                        ? new Date(a.dueDate).getTime()
                        : Number.MAX_SAFE_INTEGER;
                    const bTime = b.dueDate
                        ? new Date(b.dueDate).getTime()
                        : Number.MAX_SAFE_INTEGER;
                    return aTime - bTime;
                }
                if (this.listSortKey === 'createdAt') {
                    const aTime = this.getTimeValue(a.createdAt);
                    const bTime = this.getTimeValue(b.createdAt);
                    return bTime - aTime;
                }
                if (this.listSortKey === 'updatedAt') {
                    const aTime = this.getTimeValue(a.updatedAt);
                    const bTime = this.getTimeValue(b.updatedAt);
                    return bTime - aTime;
                }
                return 0;
            });
        }
        return this.filterTasksBySearchQuery(list);
    }

    private normalizeForSearch(value: unknown): string {
        const s = value == null ? '' : String(value);
        try {
            return s.normalize('NFKC').trim().toLowerCase();
        } catch {
            return s.trim().toLowerCase();
        }
    }

    private filterTasksBySearchQuery(tasks: Task[]): Task[] {
        const q = this.normalizeForSearch(this.listSearchQuery());
        if (!q) return tasks;
        return tasks.filter((t) => {
            const title = this.normalizeForSearch(t.title);
            const memo = this.normalizeForSearch(t.memo);
            return title.includes(q) || memo.includes(q);
        });
    }

    getTimeValue(value: unknown): number {
        if (!value) return 0;
        if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
            return (value as { toDate: () => Date }).toDate().getTime();
        }
        if (typeof (value as { seconds?: number }).seconds === 'number') {
            return (value as { seconds: number }).seconds * 1000;
        }
        const time = new Date(value as string).getTime();
        return Number.isNaN(time) ? 0 : time;
    }

    isDueDateWithin(dueDate: string, days: number): boolean {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const date = new Date(today);
        date.setDate(date.getDate() + days);
        date.setHours(0, 0, 0, 0);
        const due = new Date(dueDate);
        due.setHours(0, 0, 0, 0);
        return (
            due.getTime() >= today.getTime() && due.getTime() <= date.getTime()
        );
    }

    toggleSortMenu() {
        if (this.isSortMenuOpen) {
            this.isSortMenuOpen = false;
        } else {
            this.isPriorityFilterOpen = false;
            this.isProgressFilterOpen = false;
            this.isDueDateFilterOpen = false;
            this.isSortMenuOpen = true;
        }
    }

    selectSort(sortKey: SortKey) {
        this.listSortKey = sortKey;
        this.isSortMenuOpen = false;
        this.isSelectedSort = true;
    }

    clearSort() {
        this.listSortKey = null;
        this.isSelectedSort = false;
        this.isSortMenuOpen = false;
    }

    getSortLabel(sortKey: SortKey): string {
        switch (sortKey) {
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

    togglePriorityFilter() {
        this.isPriorityFilterOpen = !this.isPriorityFilterOpen;
    }
    selectPriority(value: '高' | '中' | '低' | '未設定' | null) {
        this.priorityFilter = value;
        this.isPriorityFilterOpen = false;
    }
    clearPriorityFilter() {
        this.priorityFilter = null;
    }

    toggleProgressFilter() {
        this.isProgressFilterOpen = !this.isProgressFilterOpen;
    }
    selectProgress(
        value: '未着手' | '進行中' | '保留' | '完了' | null,
    ) {
        this.progressFilter = value;
        this.isProgressFilterOpen = false;
    }
    clearProgressFilter() {
        this.progressFilter = null;
    }

    toggleDueDateFilter() {
        this.isDueDateFilterOpen = !this.isDueDateFilterOpen;
    }
    selectDueDate(value: '今日' | '明日' | '1週間' | '未設定' | null) {
        this.dueDateFilter = value;
        this.isDueDateFilterOpen = false;
    }
    clearDueDateFilter() {
        this.dueDateFilter = null;
    }

    onRowCheckboxChange(taskId: string, checked: boolean) {
        if (checked) {
            if (!this.selectedTaskIds.includes(taskId)) {
                this.selectedTaskIds = [...this.selectedTaskIds, taskId];
            }
        } else {
            this.selectedTaskIds = this.selectedTaskIds.filter(
                (id) => id !== taskId,
            );
        }
    }

    isAllDisplayedNotDoneSelected(): boolean {
        const rows = this.displayTasks('notDone');
        return (
            rows.length > 0 &&
            rows.every((t) => this.selectedTaskIds.includes(t.id))
        );
    }

    onToggleSelectAllNotDone(checked: boolean) {
        const ids = this.displayTasks('notDone').map((t) => t.id);
        if (checked) {
            this.selectedTaskIds = [...new Set([...this.selectedTaskIds, ...ids])];
        } else {
            const drop = new Set(ids);
            this.selectedTaskIds = this.selectedTaskIds.filter(
                (id) => !drop.has(id),
            );
        }
    }

    async deleteSelectedTask() {
        if (this.selectedTaskIds.length === 0) return;
        const ids = [...this.selectedTaskIds];
        try {
            for (const taskId of ids) {
                await deleteChildrenTask(taskId);
            }
            this.tasks.update((current) =>
                current.filter((t) => !ids.includes(t.id)),
            );
            this.selectedTaskIds = [];
        } catch (error) {
            console.error('タスク一括削除失敗: ', error);
        }
    }

    getDueDateStatus(dueDate: string | null, taskStatus: string): string {
        if (taskStatus === '完了') return '';
        if (!dueDate) return '';
        const today = new Date();
        const due = new Date(dueDate);
        today.setHours(0, 0, 0, 0);
        due.setHours(0, 0, 0, 0);
        const diff =
            (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
        if (diff < 0) return 'overdue';
        if (diff <= 2) return 'near';
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
    }  nextWeek() {
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

      return this.tasks().filter(task => {
        if(!task.startDate || !task.dueDate) return false;
        return task.startDate <= weekEnd && task.dueDate >= weekStart;
      });
    }

    /** 週内の未完了タスク（tasks.component の getCalendarWeekTasks に相当） */
    getCalendarWeekTasks(): Task[] {
      return this.getWeekTasks().filter(t => t.status !== '完了');
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

    getCalendarBoardMinHeight(): number {
        const rows = this.sortedWeekTasks().length;
        const taskBand = rows * this.calendarRowHeightPx + 24;
        const bodyFloor = 220;
        return Math.max(320, this.calendarHeaderBandPx + Math.max(bodyFloor, taskBand));
    }
}

