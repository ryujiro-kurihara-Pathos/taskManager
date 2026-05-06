import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
    getProject,
    getProjectMembers,
    getUser,
    deleteProjectMember,
    isAdmin,
} from '../../firestore';
import { Project } from '../../types/project';
import { getTasksByProjectId } from '../../firestore';
import { AddTaskInput, Task } from '../../types/task';
import { FormsModule } from '@angular/forms';
import { addTask } from '../../firestore';
import { AuthStateService } from '../../services/auth-state.service';
import { ModalService } from '../../services/modal.service';

@Component({
    selector: 'app-project-detail',
    templateUrl: './project-detail.component.html',
    imports: [FormsModule],
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
    tasks: Task[] = [];
    newTaskTitle: string = '';

    async ngOnInit() {
        if(!this.projectId) return;
        // プロジェクトを取得
        this.project = await this.getProject(this.projectId);
        if(!this.project) return;
        // プロジェクトタスクを取得
        this.tasks = await this.getTasksByProjectId(this.projectId);

        // プロジェクトメンバーを取得
        const projectMembers = await this.getProjectMembers(this.projectId);
        this.project.projectMembers = projectMembers;
    }

    openProjectInviteModal(project: Project) {
        this.modalService.open('project-invite', project);
    }

    openProjectEditModal(project: Project) {
        this.modalService.open('project-edit', project);
    }

    openMemberListModal(project: Project) {
        this.modalService.open('project-member-list', project);
    }

    // タスク追加モーダルを開く
    openTaskAddModal(project: Project) {
        this.modalService.open('task-add', project);
    }

    closeTaskAddModal() {
        
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
            }
            const newTask = await addTask(task);
            if (!newTask) return;
            this.tasks.push(newTask);
            this.closeTaskAddModal();
        } catch (error) {
            console.error('タスクを追加できませんでした', error);
            return;
        }
    }
    // 状況別のタスク取得
    getTasksByStatus(status: string) {
        return this.tasks.filter(task => task.status === status);
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

    // プロジェクトを抜ける
    async leaveProject(projectId: string) {
        try {
            const user = this.authStateService.user();
            if(!user) return;
            const isAdminUser = await isAdmin(user.id, projectId);
            if(isAdminUser) return;
            await deleteProjectMember(user.id, projectId);
            this.router.navigate(['/home/projects']);
        } catch (error) {
            console.error('プロジェクトを抜けれませんでした', error);
            return;
        }
    }
}

