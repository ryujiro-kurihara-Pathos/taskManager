import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import {
    Component,
    HostListener,
    OnDestroy,
    OnInit,
    inject,
    signal,
    computed,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { ModalService } from '../../services/modal.service';
import { TasksService } from '../../services/tasks.service';
import { AuthStateService } from '../../services/auth-state.service';
import { AddTaskInput, SortKey, Tag, Task } from '../../types/task';
import { Team, TeamMember } from '../../types/team';
import { isTaskCreator } from '../../utils/task-permissions';
import { userAvatarInitial } from '../../utils/user-avatar';
import {
    canEditTeamBasics,
    canManageTeamMembers,
    canViewTeam,
    effectiveTeamRole,
    memberRoleLabelJa,
    type MemberRole,
} from '../../utils/member-permissions';
import {
    deleteChildrenTask,
    getTeamById,
    getTeamMembersByTeamId,
    getTasksByTeamId,
    getUser,
    updateTask,
    getProjectsByTeamId,
    getTasksByProjectId,
    getProjectMembers,
    getTags,
} from '../../firestore';
import { Project } from '../../types/project';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';

export type TeamDetailTaskTab = 'all' | 'active' | 'done' | 'overdue';

export type TeamProjectCardView = {
    project: Project;
    activeRootCount: number;
    completedRootCount: number;
    memberCount: number;
    /** 現在ユーザーが projectMembers に含まれる場合のみタスク件数を取得済み */
    isProjectMember: boolean;
};

function isTaskOverdue(task: Task): boolean {
    if (task.status === '完了' || !task.dueDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(task.dueDate);
    due.setHours(0, 0, 0, 0);
    return due.getTime() < today.getTime();
}

@Component({
    selector: 'app-team-detail',
    templateUrl: './team-detail.component.html',
    standalone: true,
    imports: [CommonModule, RouterLink, DragDropModule],
})
export class TeamDetailComponent implements OnInit, OnDestroy {
    private route = inject(ActivatedRoute);
    private confirmDialog = inject(ConfirmDialogService);
    private modalService = inject(ModalService);

    tasksService = inject(TasksService);
    authState = inject(AuthStateService);

    displayFormat: 'list' | 'board' | 'calendar' = 'list';

    weekDates: Date[] = [];
    currentDate = new Date();
    readonly calendarRowHeightPx = 48;
    readonly calendarHeaderBandPx = 65;
    calendarShowCompletedTasks = false;

    private teamBoardScopedTasks(): Task[] {
        const ctx = this.tasksService.taskListContext();
        if (ctx.mode !== 'team') return [];
        const teamId = ctx.teamId;
        const include = this.tasksService.teamListIncludeProjectTasks();
        const projectIds = new Set(this.tasksService.teamMergedProjectIds());
        return this.tasksService.tasks().filter((task) => {
            if (task.parentTaskId != null) return false;
            if (task.teamId === teamId && task.projectId == null) return true;
            if (
                include &&
                task.projectId != null &&
                projectIds.has(task.projectId)
            ) {
                return true;
            }
            return false;
        });
    }

    readonly filteredBoardTodos = computed(() =>
        this.tasksService.applySearchOnly(
            this.teamBoardScopedTasks().filter((t) => t.status === '未着手'),
        ),
    );
    readonly filteredBoardInProgress = computed(() =>
        this.tasksService.applySearchOnly(
            this.teamBoardScopedTasks().filter((t) => t.status === '進行中'),
        ),
    );
    readonly filteredBoardOnHold = computed(() =>
        this.tasksService.applySearchOnly(
            this.teamBoardScopedTasks().filter((t) => t.status === '保留'),
        ),
    );
    readonly filteredBoardDone = computed(() =>
        this.tasksService.applySearchOnly(
            this.teamBoardScopedTasks().filter((t) => t.status === '完了'),
        ),
    );

    teamId = signal<string>('');
    team = signal<Team | null | undefined>(undefined);
    teamMembers = signal<TeamMember[]>([]);
    /** teamMembers に自分がいない（URL を知っている第三者など） */
    teamLoadForbidden = signal(false);

    /** チーム直下タスクの表示タブ */
    teamTaskTab = signal<TeamDetailTaskTab>('all');

    teamProjectCards = signal<TeamProjectCardView[]>([]);

    selectedTaskIds: string[] = [];

    avatarLetter(name: string | null | undefined): string {
        return userAvatarInitial(name);
    }

    private modalSub?: Subscription;
    private lastModalState: { isOpen: boolean; type: string | null } = {
        isOpen: false,
        type: null,
    };

    isSortMenuOpen = false;
    isFilterMenuOpen = false;
    isSelectedSort = false;

    /** チーム直下タスクの件数（一覧と同期） */
    /** チーム編集モーダルを開けるのはオーナーまたは admin（member は閲覧のみ） */
    canOpenTeamSettingsModal = computed(() => {
        const t = this.team();
        if (!t) return false;
        const uid = this.authState.uid;
        return (
            canEditTeamBasics(t, this.teamMembers(), uid) ||
            canManageTeamMembers(t, this.teamMembers(), uid)
        );
    });

    /** ヘッダーに表示する、このチームでの現在ユーザーの権限 */
    myTeamRoleBadge = computed((): { roleJa: string; role: MemberRole } | null => {
        const t = this.team();
        if (!t) return null;
        const uid = this.authState.uid;
        if (!uid) return null;
        const r = effectiveTeamRole(t, this.teamMembers(), uid);
        const roleJa = memberRoleLabelJa(r);
        if (!r || !roleJa) return null;
        return { roleJa, role: r };
    });

    /** 一覧のフィルター・ソートと同じ集合を前提にした件数（チーム直下＋任意でプロジェクト） */
    teamTaskOverview = computed(() => {
        const tasks = this.tasksService.getDisplayTasks(null);
        let active = 0;
        let done = 0;
        let overdue = 0;
        for (const t of tasks) {
            if (t.status === '完了') {
                done++;
                continue;
            }
            if (isTaskOverdue(t)) overdue++;
            else active++;
        }
        return {
            total: tasks.length,
            active,
            done,
            overdue,
        };
    });

    async ngOnInit() {
        this.weekDates = this.getWeekDates(this.currentDate);
        const teamId = this.route.snapshot.paramMap.get('teamId');
        if (!teamId) return;
        this.teamId.set(teamId);

        const teamData = await getTeamById(teamId);
        if (!teamData) {
            this.team.set(null);
            return;
        }

        const members = await getTeamMembersByTeamId(teamId);
        await this.enrichMemberUsers(members);
        this.teamMembers.set(members);

        const uid = this.authState.uid;
        if (!canViewTeam(members, uid)) {
            this.teamLoadForbidden.set(true);
            this.team.set(null);
            return;
        }

        this.team.set(teamData);

        const tasks = await getTasksByTeamId(teamId);
        await this.tasksService.loadTaskTags(tasks);
        this.tasksService.setTasks(tasks);
        this.tasksService.setTaskListContextTeam(teamId);
        this.tasksService.searchQuery.set('');
        this.tasksService.closeAllFilterMenus();
        this.tasksService.sortKey = null;
        this.tasksService.allTaskTags = (await getTags(this.authState.uid)) as Tag[];

        await this.loadTeamProjectCards(teamId);

        this.modalSub = this.modalService.modalState$.subscribe((s) => {
            const prev = this.lastModalState;
            const closing = prev.isOpen && !s.isOpen;
            if (closing) {
                if (prev.type === 'task-add' || prev.type === 'task-edit') {
                    void this.reloadTeamTasksAndProjects();
                }
                if (prev.type === 'team-edit') {
                    void this.reloadTeamSnapshot();
                }
            }
            this.lastModalState = { isOpen: s.isOpen, type: s.type };
        });
    }

    ngOnDestroy() {
        this.modalSub?.unsubscribe();
        this.tasksService.setTaskListContextMain();
    }

    setTeamTaskTab(tab: TeamDetailTaskTab) {
        this.teamTaskTab.set(tab);
        this.selectedTaskIds = [];
    }

    /** パイプライン適用後の一覧をタブで絞り込み */
    displayTeamTasksForTab(): Task[] {
        const base = this.tasksService.getDisplayTasks(null);
        switch (this.teamTaskTab()) {
            case 'all':
                return base;
            case 'done':
                return base.filter((t) => t.status === '完了');
            case 'overdue':
                return base.filter((t) => t.status !== '完了' && isTaskOverdue(t));
            case 'active':
                return base.filter((t) => t.status !== '完了' && !isTaskOverdue(t));
            default:
                return base;
        }
    }

    /** 一括操作の対象（作成者のみ・現在タブの表示中） */
    deletableVisibleTasks(): Task[] {
        return this.displayTeamTasksForTab().filter((t) => this.isTaskCreatorTask(t));
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

    private async reloadTeamSnapshot(): Promise<void> {
        const id = this.teamId();
        if (!id) return;
        const teamData = await getTeamById(id);
        this.team.set(teamData);
        const members = await getTeamMembersByTeamId(id);
        await this.enrichMemberUsers(members);
        this.teamMembers.set(members);
    }

    private async reloadTeamTasksAndProjects(): Promise<void> {
        const id = this.teamId();
        if (!id) return;
        const teamRoots = await getTasksByTeamId(id);
        let merged: Task[] = [...teamRoots];
        if (this.tasksService.teamListIncludeProjectTasks()) {
            const projectIds = this.tasksService.teamMergedProjectIds();
            if (projectIds.length > 0) {
                const chunks = await Promise.all(
                    projectIds.map((pid) => getTasksByProjectId(pid)),
                );
                for (const chunk of chunks) {
                    merged.push(
                        ...chunk.filter((t) => t.parentTaskId == null),
                    );
                }
            }
        }
        const byId = new Map(merged.map((t) => [t.id, t]));
        merged = [...byId.values()];
        await this.tasksService.loadTaskTags(merged);
        this.tasksService.setTasks(merged);
        this.tasksService.allTaskTags = (await getTags(this.authState.uid)) as Tag[];
        await this.loadTeamProjectCards(id);
    }

    async onTeamIncludeProjectTasksChange(ev: Event): Promise<void> {
        const el = ev.target as HTMLInputElement | null;
        this.tasksService.setTeamListIncludeProjectTasks(!!el?.checked);
        await this.reloadTeamTasksAndProjects();
    }

    private async loadTeamProjectCards(teamId: string): Promise<void> {
        try {
            const uid = this.authState.uid;
            const projects = await getProjectsByTeamId(teamId);
            this.tasksService.setTeamMergedProjectIds(projects.map((p) => p.id));
            const cards = await Promise.all(
                projects.map(async (project) => {
                    const members = await getProjectMembers(project.id);
                    const isProjectMember = members.some((m) => m.userId === uid);
                    if (!isProjectMember) {
                        return {
                            project,
                            activeRootCount: 0,
                            completedRootCount: 0,
                            memberCount: members.length,
                            isProjectMember: false,
                        } satisfies TeamProjectCardView;
                    }
                    const tasks = await getTasksByProjectId(project.id);
                    const roots = tasks.filter((t) => t.parentTaskId == null);
                    const activeRootCount = roots.filter((t) => t.status !== '完了').length;
                    const completedRootCount = roots.filter((t) => t.status === '完了').length;
                    return {
                        project,
                        activeRootCount,
                        completedRootCount,
                        memberCount: members.length,
                        isProjectMember: true,
                    } satisfies TeamProjectCardView;
                }),
            );
            this.teamProjectCards.set(cards);
        } catch (e) {
            console.error('チームプロジェクト概要の取得に失敗しました', e);
            this.teamProjectCards.set([]);
            this.tasksService.setTeamMergedProjectIds([]);
        }
    }

    openTeamEditModal(team: Team) {
        if (!this.canOpenTeamSettingsModal()) return;
        this.modalService.open('team-edit', {
            ...team,
            teamMembers: this.teamMembers(),
        });
    }

    openTaskModal(type: 'task-edit' | 'task-add', task: Task | null) {
        if (type === 'task-add') {
            this.modalService.open('task-add', { id: this.teamId(), scope: 'team' });
            return;
        }
        if (task) {
            this.modalService.open('task-edit', task);
        }
    }

    isTaskCreatorTask(task: Task): boolean {
        return isTaskCreator(task, this.authState.uid);
    }

    /** 担当者列: assignedUid と assignableUsers / チームメンバーから表示名を解決 */
    assigneeName(task: Task): string {
        if (!task.assignedUid) return '未設定';
        const uid = task.assignedUid;
        const fromAssignable = task.assignableUsers?.find((u) => u.id === uid);
        if (fromAssignable?.userName) return fromAssignable.userName;
        const member = this.teamMembers().find((m) => m.userId === uid);
        if (member?.user?.userName) return member.user.userName;
        return '未設定';
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

    isAllVisibleDeletableSelected(): boolean {
        const tasks = this.deletableVisibleTasks();
        return tasks.length > 0 && tasks.every((t) => this.selectedTaskIds.includes(t.id));
    }

    onToggleSelectAllVisible(checked: boolean) {
        const ids = this.deletableVisibleTasks().map((t) => t.id);
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
        const ok = await this.confirmDialog.confirm({
            title: '選択した課題を削除しますか？',
            message: `削除できる ${allowed.length} 件の課題を完全に削除します。子タスクやコメントも失われます。よろしいですか？`,
        });
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

    priorityPillClass(priority: string | null): string {
        if (priority === '高') return 'task-pill task-pill--pri-high';
        if (priority === '中') return 'task-pill task-pill--pri-medium';
        if (priority === '低') return 'task-pill task-pill--pri-low';
        return 'task-pill task-pill--pri-none';
    }

    tagPillClass(color: string): string {
        return `task-pill task-pill--tag-${color}`;
    }

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

    calendarBarModifierClass(task: Task): string {
        if (task.status === '完了') {
            return 'cal-bar--done';
        }
        if (this.getDueDateStatus(task.dueDate, task.status) === 'overdue') {
            return 'cal-bar--overdue';
        }
        switch (task.status) {
            case '未着手':
                return 'cal-bar--todo';
            case '進行中':
                return 'cal-bar--inprogress';
            case '保留':
                return 'cal-bar--hold';
            default:
                return 'cal-bar--default';
        }
    }

    calendarTagCategoryClass(tag: Tag): string {
        const raw = (tag.name ?? '').trim();
        if (/仕事|業務|会議|仕様|プロジェクト|タスク/i.test(raw)) {
            return 'cal-tag-cat--work';
        }
        if (/学習|勉強|学校|講義|受験|資格|課題/i.test(raw)) {
            return 'cal-tag-cat--study';
        }
        if (/家事|掃除|買い物|育児/i.test(raw)) {
            return 'cal-tag-cat--chore';
        }
        if (/個人|プライベート|趣味|プライベ/i.test(raw)) {
            return 'cal-tag-cat--personal';
        }
        const c = String(tag.color ?? 'gray').replace(/[^a-z0-9-]/gi, '') || 'gray';
        return `cal-tag-palette--${c}`;
    }

    calendarTagDotClasses(tag: Tag): string {
        return `cal-tag-dot ${this.calendarTagCategoryClass(tag)}`;
    }

    onCalendarShowCompletedChange(ev: Event): void {
        const el = ev.target as HTMLInputElement | null;
        this.calendarShowCompletedTasks = !!el?.checked;
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
            tasks.map((task) =>
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
        const ids = this.tasksService.getDisplayTasks('notDone').map((t) => t.id);
        if (this.calendarShowCompletedTasks) {
            ids.push(...this.tasksService.getDisplayTasks('done').map((t) => t.id));
        }
        const displayedIds = new Set(ids);
        return this.getWeekTasks().filter((t) => displayedIds.has(t.id));
    }

    getTaskStartIndex(task: Task): number {
        if (!task.startDate) return 0;
        const weekStart = this.formatDate(this.weekDates[0]);
        if (task.startDate <= weekStart) {
            return 0;
        }
        return this.weekDates.findIndex((d) => this.formatDate(d) === task.startDate);
    }

    getTaskLeftPercent(task: Task): number {
        const startIndex = this.getTaskStartIndex(task);
        return (startIndex / 7) * 100;
    }

    getTaskEndIndex(task: Task): number {
        if (!task.dueDate) return 0;
        const weekEnd = this.formatDate(this.weekDates[6]);
        if (task.dueDate >= weekEnd) {
            return 6;
        }
        return this.weekDates.findIndex((d) => this.formatDate(d) === task.dueDate);
    }

    getTaskWidthPercent(task: Task): number {
        const startIndex = this.getTaskStartIndex(task);
        const endIndex = this.getTaskEndIndex(task);
        const spanDays = endIndex - startIndex + 1;
        return (spanDays / 7) * 100;
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

    getTaskRow(task: { id: string }): number {
        return this.sortedWeekTasks().findIndex((t) => t.id === task.id);
    }

    getTaskTop(task: { id: string }): number {
        return this.getTaskRow(task) * this.calendarRowHeightPx;
    }

    getCalendarBoardMinHeight(): number {
        const rows = this.sortedWeekTasks().length;
        const taskBand = rows * this.calendarRowHeightPx + 24;
        const bodyFloor = 220;
        return Math.max(
            320,
            this.calendarHeaderBandPx + Math.max(bodyFloor, taskBand),
        );
    }
}
