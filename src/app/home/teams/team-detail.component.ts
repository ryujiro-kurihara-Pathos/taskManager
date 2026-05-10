import { CommonModule } from '@angular/common';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { ActivatedRoute } from '@angular/router';
import {
    Component,
    HostListener,
    OnDestroy,
    OnInit,
    inject,
    signal,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { ModalService } from '../../services/modal.service';
import { TasksService } from '../../services/tasks.service';
import { AuthStateService } from '../../services/auth-state.service';
import { SortKey, Task, AddTaskInput } from '../../types/task';
import { Team, TeamMember } from '../../types/team';
import { isTaskCreator } from '../../utils/task-permissions';
import {
    deleteChildrenTask,
    getTeamById,
    getTeamMembersByTeamId,
    getTasksByTeamId,
    getUser,
    updateTask,
} from '../../firestore';

@Component({
    selector: 'app-team-detail',
    templateUrl: './team-detail.component.html',
    standalone: true,
    imports: [CommonModule, DragDropModule],
})
export class TeamDetailComponent implements OnInit, OnDestroy {
    private route = inject(ActivatedRoute);
    private modalService = inject(ModalService);

    tasksService = inject(TasksService);
    authState = inject(AuthStateService);

    teamId = signal<string>('');
    team = signal<Team | null | undefined>(undefined);
    teamMembers = signal<TeamMember[]>([]);

    selectedTaskIds: string[] = [];

    // カレンダー
    weekDates: Date[] = [];
    currentDate = new Date();
    /** ガント行の高さ（getTaskTop と一致） */
    readonly calendarRowHeightPx = 48;
    /** ヘッダー列（曜日・日付）の下からタスク層までのオフセット（template の .task-layer top と一致） */
    readonly calendarHeaderBandPx = 65;

    private teamEditModalWasOpen = false;
    private modalSub?: Subscription;

    // メニュー
    isSortMenuOpen: boolean = false;
    isFilterMenuOpen: boolean = false;
    isSelectedSort: boolean = false;

    async ngOnInit() {
        this.weekDates = this.getWeekDates(this.currentDate);

        const teamId = this.route.snapshot.paramMap.get('teamId');
        if (!teamId) return;
        this.teamId.set(teamId);

        const teamData = await getTeamById(teamId);
        this.team.set(teamData);

        const members = await getTeamMembersByTeamId(teamId);
        await this.enrichMemberUsers(members);
        this.teamMembers.set(members);

        const tasks = await getTasksByTeamId(teamId);
        await this.tasksService.loadTaskTags(tasks);
        this.tasksService.setTasks(tasks);
        this.tasksService.setTaskListContextTeam(teamId);
        this.tasksService.searchQuery.set('');
        this.tasksService.closeAllFilterMenus();
        this.tasksService.sortKey = null;

        this.modalSub = this.modalService.modalState$.subscribe((s) => {
            const closingTeamEdit = this.teamEditModalWasOpen && !s.isOpen;
            this.teamEditModalWasOpen = !!(s.isOpen && s.type === 'team-edit');
            if (closingTeamEdit) {
                void this.reloadTeamSnapshot();
            }
        });
    }

    ngOnDestroy(): void {
        this.modalSub?.unsubscribe();
    }

    private async enrichMemberUsers(members: TeamMember[]): Promise<void> {
        await Promise.all(
            members.map(async (m) => {
                if (m.user) return;
                const u = await getUser(m.userId);
                if (u) m.user = u;
            }),
        );
    }

    /** チーム編集モーダル保存・閉じたあとにヘッダー名などを同期 */
    private async reloadTeamSnapshot(): Promise<void> {
        const id = this.teamId();
        if (!id) return;
        const teamData = await getTeamById(id);
        this.team.set(teamData);
        const members = await getTeamMembersByTeamId(id);
        await this.enrichMemberUsers(members);
        this.teamMembers.set(members);
    }

    openTeamEditModal(team: Team) {
        this.modalService.open('team-edit', { ...team });
    }

    openTeamMemberDetailModal(members: TeamMember[]) {
        this.modalService.open('team-member-detail', members);
    }

    openTaskModal(type: 'task-edit' | 'task-add', task: any) {
        if (type === 'task-add') {
            this.modalService.open('task-add', { id: this.teamId(), scope: 'team' });
            return;
        }
        this.modalService.open('task-edit', task);
    }

    isTaskCreatorTask(task: Task): boolean {
        return isTaskCreator(task, this.authState.uid);
    }

    deletableDisplayedTasks(status: 'notDone' | 'done'): Task[] {
        return this.displayTasks(status).filter((t) => this.isTaskCreatorTask(t));
    }

    async dropTask(event: CdkDragDrop<Task[]>) {
        if (event.previousContainer === event.container) {
            return;
        }
        const movedTask = event.previousContainer.data[event.previousIndex];
        if (!this.isTaskCreatorTask(movedTask)) {
            return;
        }
        const newStatus = event.container.id as Task['status'];

        this.tasksService.tasks.update((tasks) =>
            tasks.map((t) => (t.id === movedTask.id ? { ...t, status: newStatus } : t)),
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

    tagPillClass(color: string): string {
        return `task-pill task-pill--tag-${color}`;
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

    isAllDisplayedNotDoneSelected(): boolean {
        const tasks = this.deletableDisplayedTasks('notDone');
        return tasks.length > 0 && tasks.every((t) => this.selectedTaskIds.includes(t.id));
    }

    onToggleSelectAllNotDone(checked: boolean) {
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
        const ok = window.confirm(`選択中のうち、削除できる${allowed.length}件のタスクを削除しますか？`);
        if (!ok) return;

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

    displayTasks(status: 'notDone' | 'done') {
        return this.tasksService.getDisplayTasks(status);
    }

    toggleSortMenu() {
        if (this.isSortMenuOpen) {
            this.isSortMenuOpen = false;
        } else {
            this.isFilterMenuOpen = false;
            this.tasksService.closeAllFilterMenus();
            this.isSortMenuOpen = true;
        }
    }

    selectSort(sortKey: SortKey) {
        this.tasksService.sortKey = sortKey;
        this.isSortMenuOpen = false;
        this.isSelectedSort = true;
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

    // 期限の状態を取得
    getDueDateStatus(dueDate: string | null, taskStatus: string) {
        if (taskStatus === '完了') return '';
        if (!dueDate) return '';

        const today = new Date();
        const due = new Date(dueDate);

        today.setHours(0, 0, 0, 0);
        due.setHours(0, 0, 0, 0);

        const diff = (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);

        if (diff < 0) return 'overdue';
        if (diff <= 2) return 'near';
        return '';
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

    // カレンダー
    getWeekDates(baseDate: Date): Date[] {
        const date = new Date(baseDate);
        const day = date.getDay();
        date.setDate(date.getDate() - day);

        const dates: Date[] = [];
        for (let i = 0; i < 7; i++) {
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

    today() {
        const newDate = new Date();
        this.currentDate = newDate;
        this.weekDates = this.getWeekDates(this.currentDate);
    }

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

    getWeekTasks(): Task[] {
        if (this.weekDates.length === 0) return [];
        const weekStart = this.formatDate(this.weekDates[0]);
        const weekEnd = this.formatDate(this.weekDates[6]);
        return this.tasksService.tasks().filter((task) => {
            if (!task.startDate || !task.dueDate) return false;
            return task.startDate <= weekEnd && task.dueDate >= weekStart;
        });
    }

    getCalendarWeekTasks(): Task[] {
        const displayedIds = new Set(this.displayTasks('notDone').map((t) => t.id));
        return this.getWeekTasks().filter((t) => displayedIds.has(t.id));
    }

    getTaskStartIndex(task: Task): number {
        if (!task.startDate) return 0;
        const weekStart = this.formatDate(this.weekDates[0]);
        if (task.startDate <= weekStart) return 0;
        return this.weekDates.findIndex((date) => this.formatDate(date) === task.startDate);
    }

    getTaskLeftPercent(task: Task): number {
        return (this.getTaskStartIndex(task) / 7) * 100;
    }

    getTaskEndIndex(task: Task): number {
        if (!task.dueDate) return 0;
        const weekEnd = this.formatDate(this.weekDates[6]);
        if (task.dueDate >= weekEnd) return 6;
        return this.weekDates.findIndex((date) => this.formatDate(date) === task.dueDate);
    }

    getTaskWidthPercent(task: Task): number {
        const startIndex = this.getTaskStartIndex(task);
        const endIndex = this.getTaskEndIndex(task);
        return ((endIndex - startIndex + 1) / 7) * 100;
    }

    sortedWeekTasks(): Task[] {
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
        return this.sortedWeekTasks().findIndex((t) => t.id === task.id);
    }

    getTaskTop(task: { id: string }) {
        return this.getTaskRow(task) * this.calendarRowHeightPx;
    }

    getCalendarBoardMinHeight(): number {
        const rows = this.sortedWeekTasks().length;
        const taskBand = rows * this.calendarRowHeightPx + 24;
        const bodyFloor = 220;
        return Math.max(320, this.calendarHeaderBandPx + Math.max(bodyFloor, taskBand));
    }
}