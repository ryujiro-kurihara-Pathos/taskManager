import { Component, inject, OnInit } from '@angular/core';
import { AuthStateService } from '../../services/auth-state.service';
import { addProject, getProjects } from '../../firestore';
import { FormsModule } from '@angular/forms';
import { Project } from '../../types/project';
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

    ngOnInit() {
        this.authService.watchAuthState(async(user) => {
            if(!user) {
                this.projects = [];
                return;
            }
            this.projects = await this.getProjects(user.uid);
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
            if (this.newProjectName.trim() === '') return;
            const user = this.authState.user();
            if (! user) return;
            const project = await addProject({
                name: this.newProjectName,
                ownerId: user.id,
                memberIds: [user.id],
                visibility: 'private',
                isArchived: false,
                description: '',
                teamIds: [],
            });
            this.addProjectToPage(project);
            this.closeProjectAddModal();
        } catch (error) {
            console.error('プロジェクト作成に失敗しました', error);
        }
    }

    // プロジェクトをこのページに追加
    addProjectToPage(project: Project | null) {
        if (!project) return;
        this.projects.push(project);
    }

    // プロジェクトを取得
    async getProjects(uid: string) {
        try {
            const projects = await getProjects(uid);
            return projects;
        } catch (error) {
            console.error('プロジェクト取得に失敗しました', error);
            return [];
        }
    }
}