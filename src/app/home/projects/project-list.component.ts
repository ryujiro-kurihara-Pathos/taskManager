import { Component, computed, HostListener, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthStateService } from '../../services/auth-state.service';
import {
    addProject,
    addProjectMember,
    getProjectMembers,
    getProjectsByUserId,
    getTaskCountByProjectId,
    getTeamById,
    getTeamIdsByUserId,
    getTeamsByIds,
    getUser,
    projectHasIncompleteRootTasks,
} from '../../firestore';
import { FormsModule } from '@angular/forms';
import { AddProjectMemberInput, Project } from '../../types/project';
import { Team } from '../../types/team';
import { AuthService } from '../../services/auth.service';
import { TasksService } from '../../services/tasks.service';
import { userAvatarInitial } from '../../utils/user-avatar';

@Component({
    selector: 'app-project-list',
    templateUrl: './project-list.component.html',
    standalone: true,
    imports: [ FormsModule, RouterLink ],
})

export class ProjectListComponent {
    authState = inject(AuthStateService);
    authService = inject(AuthService);
    tasksService = inject(TasksService);
    private route = inject(ActivatedRoute);
    private router = inject(Router);

    projects = signal<Project[]>([]);
    /** 参加中チーム（作成モーダルの選択用） */
    userTeams = signal<Team[]>([]);

    // プロジェクト検索（tasks と同仕様: IME対応は template 側、比較は NFKC 正規化）
    searchQuery = signal('');
    /** ルート課題に未完了が1件以上あるプロジェクト id */
    projectsWithOpenTasksIds = signal<Set<string>>(new Set());
    /** クエリ active=1 のとき true（プロフィールからの遷移） */
    queryActiveProjectsOnly = signal(false);

    filteredProjects = computed(() => {
        let projects = this.filterProjectsByTeam(
            this.projects(),
            this.selectedTeamIds() ?? [],
        );
        projects = this.filterProjectsBySearchQuery(projects);
        if (this.queryActiveProjectsOnly()) {
            const open = this.projectsWithOpenTasksIds();
            projects = projects.filter((p) => open.has(p.id));
        }
        return projects;
    });

    constructor() {
        this.route.queryParamMap
            .pipe(takeUntilDestroyed())
            .subscribe((pm) => {
                this.queryActiveProjectsOnly.set(pm.get('active') === '1');
            });
    }

    // 絞り込むチーム（ヘッダのチームフィルターから選択）
    selectedTeamIds = signal<string[] | null>(null);
    isTeamFilterMenuOpen = false;

    toggleTeam(teamId: string) {
        this.selectedTeamIds.update((currentIds) =>
            currentIds?.includes(teamId)
                ? currentIds.filter((id) => id !== teamId)
                : [...(currentIds ?? []), teamId],
        );
    }

    /** メニュー内のチーム行クリック時: 選択を切り替えてからメニューを閉じる */
    selectTeamFromMenu(teamId: string): void {
        this.toggleTeam(teamId);
        this.closeTeamFilterMenu();
    }

    toggleTeamFilterMenu(): void {
        this.isTeamFilterMenuOpen = !this.isTeamFilterMenuOpen;
    }

    closeTeamFilterMenu(): void {
        this.isTeamFilterMenuOpen = false;
    }

    clearTeamFilter(): void {
        this.selectedTeamIds.set(null);
        this.closeTeamFilterMenu();
    }

    teamFilterChipLabel(): string {
        const ids = this.selectedTeamIds();
        if (!ids?.length) return '';
        const names = ids
            .map((id) => this.userTeams().find((t) => t.id === id)?.name)
            .filter((n): n is string => typeof n === 'string' && n.length > 0);
        if (names.length === 0) return `${ids.length}件`;
        if (names.length <= 2) return names.join('・');
        return `${names.length}チーム`;
    }

    @HostListener('document:click')
    onDocumentClick(): void {
        this.closeTeamFilterMenu();
    }

    // プロジェクト作成モーダル（テスト）
    isProjectAddModalOpen = false;

    // 追加するプロジェクト名
    newProjectName = '';
    newProjectVisibility: 'private' | 'members' = 'private';
    newProjectDescription = '';
    /** null = チームに紐づけない */
    newProjectTeamId: string | null = null;

    async ngOnInit() {
        this.authService.watchAuthState(async(user) => {
            if(!user) {
                this.projects.set([]);
                this.userTeams.set([]);
                this.projectsWithOpenTasksIds.set(new Set());
                return;
            }

            const teamIds = [...new Set(await getTeamIdsByUserId(user.uid))];
            this.userTeams.set(await getTeamsByIds(teamIds));
            
            // プロジェクトを取得
            const projects = await getProjectsByUserId(user.uid);
            if(!projects) return;
            this.projects.set(projects);
            await this.refreshProjectOpenFlags(projects);

            // タスク数、チームメンバー、チーム名を取得
            for(const project of this.projects()) {
                // タスク数を取得
                const taskCount = await this.getTaskCount(project.id);
                project.taskCount = taskCount;

                // チーム名を取得
                const members = await this.getProjectMembers(project.id);
                members.forEach(async (member) => {
                    const user = await getUser(member.userId);
                    if(!user) return;
                    member.user = user;
                });
                project.projectMembers = members;

                // チーム名を取得
                if(!project.teamId) continue;
                const team = await getTeamById(project.teamId);
                if(!team) return;
                project.teamName = team.name;
            }
        });
    }

    private async refreshProjectOpenFlags(projectList: Project[]): Promise<void> {
        const s = new Set<string>();
        await Promise.all(
            projectList.map(async (p) => {
                if (await projectHasIncompleteRootTasks(p.id)) {
                    s.add(p.id);
                }
            }),
        );
        this.projectsWithOpenTasksIds.set(s);
    }

    clearActiveProjectFilter(): void {
        void this.router.navigate(['/home/projects'], { replaceUrl: true });
    }

    private normalizeForSearch(value: unknown): string {
        const s = value == null ? '' : String(value);
        try {
            return s.normalize('NFKC').trim().toLowerCase();
        } catch {
            return s.trim().toLowerCase();
        }
    }

    private filterProjectsBySearchQuery(projects: Project[]): Project[] {
        const q = this.normalizeForSearch(this.searchQuery());
        if (!q) return projects;
        return projects.filter((p) => this.normalizeForSearch(p.name).includes(q));
    }

    openProjectAddModal() {
        this.isProjectAddModalOpen = true;
    }

    closeProjectAddModal() {
        this.isProjectAddModalOpen = false;
        this.newProjectName = '';
        this.newProjectVisibility = 'private';
        this.newProjectDescription = '';
        this.newProjectTeamId = null;
    }

    async getTaskCount(projectId: string) {
        try {
            const taskCount = await getTaskCountByProjectId(projectId);
            return taskCount;
        } catch (error) {
            console.error('タスク数取得に失敗しました', error);
            return 0;
        }
    }

    async addProject() {
        try {
            // タイトルが空の場合は終了
            if (this.newProjectName.trim() === '') return;

            // ユーザーがログインしていない場合は終了
            const user = this.authState.user();
            if (! user) return;

            // プロジェクトをFirestoreに追加
            const project = await addProject({
                name: this.newProjectName,
                ownerId: user.id,
                visibility: this.newProjectVisibility,
                description: this.newProjectDescription,
                teamId: this.newProjectTeamId,
            });
            if (!project) return;

            // プロジェクトメンバーをFirestoreに追加
            await this.addProjectMemnber(project.id, user.id, 'owner');

            // 追加したプロジェクトをページで更新
            this.addProjectToPage(project);

            // モーダルを閉じる
            this.closeProjectAddModal();
        } catch (error) {
            console.error('プロジェクト作成に失敗しました', error);
        }
    }

    // プロジェクトをチームで絞り込む
    private filterProjectsByTeam(projects: Project[], selectedTeamIds: string[]) {
        if(selectedTeamIds.length === 0 || !selectedTeamIds) return projects;
        const filteredProjects = projects.filter(project =>
            selectedTeamIds.includes(project.teamId ?? '')
        );
        return filteredProjects;
    }

    // プロジェクトをこのページに追加
    async addProjectToPage(project: Project) {
        try {
            const members = await this.getProjectMembers(project.id);
            members.forEach(async (member) => {
                const user = await getUser(member.userId);
                if(!user) return;
                member.user = user;
            });
            const taskCount = await this.getTaskCount(project.id);
            project.projectMembers = members;
            project.taskCount = taskCount;
            this.projects.update((projects) => [project, ...projects]);
        } catch (error) {
            console.error('プロジェクトをこのページに追加に失敗しました', error);
        }
    }
    
    // プロジェクトメンバーをFirestoreに追加
    async addProjectMemnber(projectId: string, uid: string, role: 'owner' | 'admin' | 'member') {
        try {
            const projectMemberInput: AddProjectMemberInput = {
                projectId: projectId,
                userId: uid,
                role: role,
            }
            // プロジェクトメンバーをFirestoreに追加
            await addProjectMember(projectMemberInput);

            // プロジェクトメンバーをページに追加
        } catch (error) {
            console.error('プロジェクトメンバー追加に失敗しました', error);
        }
    }

    // プロジェクトを取得
    async getProjects(uid: string) {
        try {
            const projects = await getProjectsByUserId(uid);
            return projects;
        } catch (error) {
            console.error('プロジェクト取得に失敗しました', error);
            return [];
        }
    }

    // プロジェクトメンバーを取得
    async getProjectMembers(projectId: string) {
        try {
            const projectMembers = await getProjectMembers(projectId);
            return projectMembers;
        } catch (error) {
            console.error('プロジェクトメンバー取得に失敗しました', error);
            return [];
        }
    }

    avatarLetter(name: string | null | undefined): string {
        return userAvatarInitial(name);
    }

    goMemberProfile(userId: string, event: Event): void {
        event.preventDefault();
        event.stopPropagation();
        void this.router.navigate(['/profile', userId]);
    }
}