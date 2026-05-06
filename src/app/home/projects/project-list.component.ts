import { Component, inject, OnInit } from '@angular/core';
import { AuthStateService } from '../../services/auth-state.service';
import {
    addProject,
    addProjectMember,
    getProjectMembers,
    getProjectsByUserId,
    getUser,
} from '../../firestore';
import { FormsModule } from '@angular/forms';
import { AddProjectMemberInput, Project } from '../../types/project';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
    selector: 'app-project-list',
    templateUrl: './project-list.component.html',
    standalone: true,
    imports: [ FormsModule, RouterLink ],
})

export class ProjectListComponent {
    authState = inject(AuthStateService);
    authService = inject(AuthService);

    projects: Project[] = [];

    // プロジェクト作成モーダル（テスト）
    isProjectAddModalOpen = false;

    // 追加するプロジェクト名
    newProjectName = '';

    async ngOnInit() {
        this.authService.watchAuthState(async(user) => {
            if(!user) {
                this.projects = [];
                return;
            }
            // プロジェクトを取得
            this.projects = await this.getProjects(user.uid);
            // プロジェクトメンバーを取得
            for(const project of this.projects) {
                const projectMembers = await this.getProjectMembers(project.id);
                projectMembers.forEach(async (member) => {
                    const user = await getUser(member.userId);
                    if(!user) return;
                    member.user = user
                });
                project.projectMembers = projectMembers;
            }
        })
    }

    openProjectAddModal() {
        this.isProjectAddModalOpen = true;
    }

    closeProjectAddModal() {
        this.isProjectAddModalOpen = false;
        this.newProjectName = '';
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
                visibility: 'private',
                description: '',
                teamId: null,
                projectMembers: null,
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
    async addProjectToPage(project: Project | null) {
        if (!project) return;
        // プロジェクトメンバーを取得
        const user = await getUser(project.ownerId);
        if(!user) return;
        project.projectMembers = [{
            id: project.id,
            projectId: project.id,
            userId: project.ownerId,
            role: 'owner',
            createdAt: project.createdAt,
            user: user,
        }];

        this.projects.push(project);
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