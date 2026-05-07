import { Component, computed, inject, signal } from '@angular/core';
import { AuthStateService } from '../../services/auth-state.service';
import {
    addProject,
    addProjectMember,
    getProjectMembers,
    getProjectsByUserId,
    getTaskCountByProjectId,
    getUser,
} from '../../firestore';
import { FormsModule } from '@angular/forms';
import { AddProjectMemberInput, Project } from '../../types/project';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { TasksService } from '../../services/tasks.service';

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

    projects = signal<Project[]>([]);

    // プロジェクト検索（tasks と同仕様: IME対応は template 側、比較は NFKC 正規化）
    searchQuery = signal('');
    filteredProjects = computed(() =>
        this.filterProjectsBySearchQuery(this.projects()),
    );

    // プロジェクト作成モーダル（テスト）
    isProjectAddModalOpen = false;

    // 追加するプロジェクト名
    newProjectName = '';
    newProjectVisibility: 'private' | 'members' = 'private';
    newProjectDescription = '';

    async ngOnInit() {
        this.authService.watchAuthState(async(user) => {
            if(!user) {
                this.projects.set([]);
                return;
            }
            
            // プロジェクトを取得
            const projects = await getProjectsByUserId(user.uid);
            if(!projects) return;
            this.projects.set(projects);

            for(const project of this.projects()) {
                const taskCount = await this.getTaskCount(project.id);
                project.taskCount = taskCount;
                const members = await this.getProjectMembers(project.id);
                members.forEach(async (member) => {
                    const user = await getUser(member.userId);
                    if(!user) return;
                    member.user = user;
                });
                project.projectMembers = members;
            }
        });
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
                teamId: null,
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
}