import {
    Component,
    HostListener,
    OnDestroy,
    OnInit,
    computed,
    inject,
    signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
    getProject,
    getProjectMembers,
    getUser,
    updateTask,
    deleteChildrenTask,
    subscribeTasksByProjectId,
    addTask,
    deleteProjectMember,
    getTeamById,
    getTeamMembersByTeamId,
} from '../../firestore';
import { Project } from '../../types/project';
import { Team } from '../../types/team';
import { AddTaskInput, SortKey, Tag, Task } from '../../types/task';
import { isTaskCreator } from '../../utils/task-permissions';
import { userAvatarInitial } from '../../utils/user-avatar';
import {
    canDeleteProject,
    canEditProjectBasics,
    canManageProjectMembers,
    canViewProject,
    effectiveProjectRole,
    effectiveTeamRole,
    memberRoleLabelJa,
    type MemberRole,
} from '../../utils/member-permissions';

/** プロジェクト詳細ヘッダー: 自分のプロジェクト権限と所属チーム権限 */
type ProjectContextBanner = {
    projectRoleJa: string;
    projectRole: MemberRole;
    team?: {
        teamId: string;
        teamName: string;
        teamRoleJa: string;
        teamRole: MemberRole;
    };
};
import { FormsModule } from '@angular/forms';
import { AuthStateService } from '../../services/auth-state.service';
import { ModalService } from '../../services/modal.service';
import { TasksService } from '../../services/tasks.service';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';
import { CommonModule } from '@angular/common';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';

@Component({
    selector: 'app-project-detail',
    templateUrl: './project-detail.component.html',
    imports: [FormsModule, CommonModule, DragDropModule, RouterLink],
})
export class ProjectDetailComponent implements OnInit, OnDestroy {
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private modalService = inject(ModalService);
    authStateService = inject(AuthStateService);
    tasksService = inject(TasksService);
    private confirmDialog = inject(ConfirmDialogService);

    displayFormat: 'list' | 'board' | 'calendar' = 'list';

    projectId = this.route.snapshot.paramMap.get('projectId');
    project: Project | null = null;
    tasks = signal<Task[]>([]);
    /** projectMembers に自分が含まれない */
    projectLoadForbidden = signal(false);

    /** ヘッダー: プロジェクト／所属チームでの自分の役割 */
    projectContextBanner = signal<ProjectContextBanner | null>(null);

    readonly filteredBoardTodos = computed(() =>
        this.tasksService.applySearchOnly(
            this.tasks().filter((t) => t.status === '未着手'),
        ),
    );
    readonly filteredBoardInProgress = computed(() =>
        this.tasksService.applySearchOnly(
            this.tasks().filter((t) => t.status === '進行中'),
        ),
    );
    readonly filteredBoardOnHold = computed(() =>
        this.tasksService.applySearchOnly(
            this.tasks().filter((t) => t.status === '保留'),
        ),
    );
    readonly filteredBoardDone = computed(() =>
        this.tasksService.applySearchOnly(
            this.tasks().filter((t) => t.status === '完了'),
        ),
    );

    selectedTaskIds: string[] = [];

    avatarLetter(name: string | null | undefined): string {
        return userAvatarInitial(name);
    }

    isSortMenuOpen = false;
    isSelectedSort = false;

    weekDates: Date[] = [];
    currentDate = new Date();
    readonly calendarRowHeightPx = 48;
    readonly calendarHeaderBandPx = 65;

    calendarShowCompletedTasks = false;

    private tasksUnsub: (() => void) | null = null;
    /** 遅い loadTaskTags が後から終わって古い一覧で上書きしないため */
    private projectTasksSnapshotSeq = 0;

    async ngOnInit() {
        this.weekDates = this.getWeekDates(this.currentDate);
        if (!this.projectId) return;
        this.project = await this.getProject(this.projectId);
        if (!this.project) return;

        const projectMembers = await this.getProjectMembers(this.projectId);
        this.project.projectMembers = projectMembers;
        const uid = this.authStateService.uid;
        if (!canViewProject(projectMembers, uid)) {
            this.projectLoadForbidden.set(true);
            this.project = null;
            return;
        }

        await this.refreshProjectContextBanner();

        this.tasksUnsub?.();
        const pid = this.projectId;
        this.tasksUnsub = subscribeTasksByProjectId(pid, (incoming) => {
            const seq = ++this.projectTasksSnapshotSeq;
            void this.tasksService.loadTaskTags(incoming).then(() => {
                if (seq !== this.projectTasksSnapshotSeq) return;
                this.tasks.set(incoming);
            });
        });
    }

    ngOnDestroy(): void {
        this.tasksUnsub?.();
        this.tasksUnsub = null;
    }

    openProjectEditModal(project: Project) {
        if (!this.canOpenProjectSettingsModal()) return;
        this.modalService.open('project-edit', project);
    }

    canOpenProjectSettingsModal(): boolean {
        if (!this.project) return false;
        const m = this.project.projectMembers ?? [];
        const uid = this.authStateService.uid;
        return (
            canEditProjectBasics(this.project, m, uid) ||
            canManageProjectMembers(this.project, m, uid)
        );
    }

    /** オーナー以外はプロジェクトから退出できる */
    canLeaveProject(): boolean {
        if (!this.project) return false;
        const m = this.project.projectMembers ?? [];
        const uid = this.authStateService.uid;
        return canViewProject(m, uid) && !canDeleteProject(this.project, m, uid);
    }

    async leaveProject(): Promise<void> {
        const p = this.project;
        const pid = this.projectId;
        const uid = this.authStateService.uid;
        if (!p || !pid || !uid) return;
        const ok = await this.confirmDialog.confirm({
            title: 'このプロジェクトから退出しますか？',
            message: 'このプロジェクトの課題にはアクセスできなくなります。チームへの所属は維持されます。',
        });
        if (!ok) return;
        try {
            await deleteProjectMember(uid, pid);
            await this.router.navigate(['/home/projects']);
        } catch (e) {
            console.error('プロジェクトからの退出に失敗しました', e);
        }
    }

    openTaskAddModal(project: Project) {
        this.modalService.open('project-add-task', project);
    }

    openTaskModal(type: 'task-edit' | 'task-add', task: unknown) {
        this.modalService.open(type, task);
    }

    isTaskCreatorTask(task: Task): boolean {
        return isTaskCreator(task, this.authStateService.uid);
    }

    deletableDisplayedTasks(status: 'notDone' | 'done' | null = null): Task[] {
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

    async getProject(projectId: string) {
        try {
            return await getProject(projectId);
        } catch (error) {
            console.error('プロジェクトを取得できませんでした', error);
            return null;
        }
    }

    private async refreshProjectContextBanner(): Promise<void> {
        const p = this.project;
        if (!p) {
            this.projectContextBanner.set(null);
            return;
        }
        const uid = this.authStateService.uid;
        const pr = effectiveProjectRole(p, p.projectMembers ?? [], uid);
        const pJa = memberRoleLabelJa(pr);
        if (!pr || !pJa) {
            this.projectContextBanner.set(null);
            return;
        }
        let teamPart: ProjectContextBanner['team'] | undefined;
        if (p.teamId) {
            try {
                const team: Team | null = await getTeamById(p.teamId);
                if (team) {
                    const tm = await getTeamMembersByTeamId(p.teamId);
                    const tr = effectiveTeamRole(team, tm, uid);
                    const tJa = memberRoleLabelJa(tr);
                    if (tr && tJa) {
                        teamPart = {
                            teamId: team.id,
                            teamName: team.name?.trim() || 'チーム',
                            teamRoleJa: tJa,
                            teamRole: tr,
                        };
                    }
                }
            } catch {
                /* チーム取得失敗時はプロジェクト行のみ */
            }
        }
        this.projectContextBanner.set({
            projectRoleJa: pJa,
            projectRole: pr,
            team: teamPart,
        });
    }

    async addTask(title: string) {
        try {
            const user = this.authStateService.user();
            if (!user) return;
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
            };
            const newTask = await addTask(task);
            if (!newTask) return;
            // 一覧は subscribeTasksByProjectId のスナップショットで更新（二重追加を避ける）
        } catch (error) {
            console.error('タスクを追加できませんでした', error);
        }
    }

    async getProjectMembers(projectId: string) {
        try {
            const projectMembers = await getProjectMembers(projectId);
            await Promise.all(
                projectMembers.map(async (member) => {
                    const user = await getUser(member.userId);
                    if (user) member.user = user;
                }),
            );
            return projectMembers;
        } catch (error) {
            console.error('プロジェクトメンバーを取得できませんでした', error);
            return [];
        }
    }

    displayTasks(status: 'notDone' | 'done' | null = null): Task[] {
        return this.tasksService.applyListPipeline([...this.tasks()], status);
    }

    /** 担当者列: assignedUid に対応する表示名（なければ「未設定」） */
    assigneeName(task: Task): string {
        if (!task.assignedUid) return '未設定';
        const uid = task.assignedUid;
        const fromAssignable = task.assignableUsers?.find((u) => u.id === uid);
        if (fromAssignable?.userName) return fromAssignable.userName;
        const members = this.project?.projectMembers ?? [];
        const member = members.find((m) => m.userId === uid);
        if (member?.user?.userName) return member.user.userName;
        return '未設定';
    }

    toggleSortMenu() {
        if (this.isSortMenuOpen) {
            this.isSortMenuOpen = false;
        } else {
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
        this.isSortMenuOpen = false;
        this.isSelectedSort = false;
    }

    closeSortMenu() {
        this.isSortMenuOpen = false;
    }

    closeAllMenus() {
        this.closeSortMenu();
        this.tasksService.closeAllFilterMenus();
    }

    @HostListener('document:click')
    onDocumentClick() {
        this.closeAllMenus();
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

    onRowCheckboxChange(taskId: string, checked: boolean) {
        const task = this.tasks().find((t) => t.id === taskId);
        if (!task || !this.isTaskCreatorTask(task)) return;
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

    isAllDisplayedSelected(): boolean {
        const rows = this.deletableDisplayedTasks(null);
        return (
            rows.length > 0 &&
            rows.every((t) => this.selectedTaskIds.includes(t.id))
        );
    }

    onToggleSelectAll(checked: boolean) {
        const ids = this.deletableDisplayedTasks(null).map((t) => t.id);
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
        const uid = this.authStateService.uid;
        const allIds = [...this.selectedTaskIds];
        const allowed = allIds.filter((id) => {
            const t = this.tasks().find((x) => x.id === id);
            return t && isTaskCreator(t, uid);
        });
        if (allowed.length === 0) {
            window.alert('選択した課題のうち、削除できるのは作成した課題のみです。');
            return;
        }
        if (allowed.length < allIds.length) {
            window.alert('作成者のみ削除できるため、該当する課題のみ削除します。');
        }
        const delOk = await this.confirmDialog.confirm({
            title: '選択した課題を削除しますか？',
            message: `削除できる ${allowed.length} 件の課題を完全に削除します。子タスクやコメントも失われます。よろしいですか？`,
        });
        if (!delOk) return;
        try {
            for (const taskId of allowed) {
                await deleteChildrenTask(taskId);
            }
            this.tasks.update((current) =>
                current.filter((t) => !allowed.includes(t.id)),
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

    /**
     * カレンダー帯の本体色（ステータス＋未完了の期限超過）。
     */
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

    /** タグ名のキーワード → 分類色。なければ既存の tag.color パレット */
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
    getWeekTasks() {
        if (this.weekDates.length === 0) return [];

        const weekStart = this.formatDate(this.weekDates[0]);
        const weekEnd = this.formatDate(this.weekDates[6]);

        return this.tasks().filter((task) => {
            if (!task.startDate || !task.dueDate) return false;
            return task.startDate <= weekEnd && task.dueDate >= weekStart;
        });
    }

    getCalendarWeekTasks(): Task[] {
        const ids = this.displayTasks('notDone').map((t) => t.id);
        if (this.calendarShowCompletedTasks) {
            ids.push(...this.displayTasks('done').map((t) => t.id));
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

        return this.weekDates.findIndex(
            (date) => this.formatDate(date) === task.startDate,
        );
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

        return this.weekDates.findIndex(
            (date) => this.formatDate(date) === task.dueDate,
        );
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
        return this.sortedWeekTasks().findIndex((t) => t.id === task.id);
    }
    getTaskTop(task: { id: string }) {
        const row = this.getTaskRow(task);
        return row * this.calendarRowHeightPx;
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
