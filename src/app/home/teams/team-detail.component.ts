import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
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
import { SortKey, Tag, Task } from '../../types/task';
import { Team, TeamMember } from '../../types/team';
import { isTaskCreator } from '../../utils/task-permissions';
import { userAvatarInitial } from '../../utils/user-avatar';
import {
    canEditTeamBasics,
    canManageTeamMembers,
    canViewTeam,
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
    imports: [CommonModule, RouterLink],
})
export class TeamDetailComponent implements OnInit, OnDestroy {
    private route = inject(ActivatedRoute);
    private confirmDialog = inject(ConfirmDialogService);
    private modalService = inject(ModalService);

    tasksService = inject(TasksService);
    authState = inject(AuthStateService);

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

    teamTaskOverview = computed(() => {
        const tasks = this.tasksService.tasks();
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
        const tasks = await getTasksByTeamId(id);
        await this.tasksService.loadTaskTags(tasks);
        this.tasksService.setTasks(tasks);
        this.tasksService.allTaskTags = (await getTags(this.authState.uid)) as Tag[];
        await this.loadTeamProjectCards(id);
    }

    private async loadTeamProjectCards(teamId: string): Promise<void> {
        try {
            const uid = this.authState.uid;
            const projects = await getProjectsByTeamId(teamId);
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
}
