import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { getProject, leaveProject } from '../../firestore';
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

    openProjectInviteModal(project: Project) {
        this.modalService.open('project-invite', project);
    }

    openMemberListModal(project: Project) {
        this.modalService.open('member-list', project);
    }

    private route = inject(ActivatedRoute);
    authStateService = inject(AuthStateService);

    // ヘッダー
    // 表示形式
    displayFormat: 'list' | 'board' | 'calendar' = 'list';

    // メイン
    projectId = this.route.snapshot.paramMap.get('projectId');
    project: Project | null = null;
    tasks: Task[] = [];
    isTaskAddModalOpen: boolean = false;
    newTaskTitle: string = '';

    async ngOnInit() {
        this.project = await this.getProject() ?? null;
        this.tasks = await this.getTasksByProjectId(this.projectId);
    }

    // タスク追加モーダルを開く
    openTaskAddModal() {
        this.isTaskAddModalOpen = true;
    }

    closeTaskAddModal() {
        this.isTaskAddModalOpen = false;
    }

    // ドキュメントIDからプロジェクトを取得
    async getProject() {
        try {
            if(!this.projectId) return;
            const project = await getProject(this.projectId);
            return project;
        } catch (error) {
            console.error('プロジェクトを取得できませんでした', error);
            return null;
        }
    }

    // プロジェクトに所属するタスクを取得
    async getTasksByProjectId(projectId: string | null) {
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
                title: title,
                status: '未着手',
                priority: '中',
                dueDate: null,
                startDate: null,
                memo: null,
                parentTaskId: null,
                projectId: this.projectId,
            }
            const newTask = await addTask(user.id, task);
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

    // プロジェクトを抜ける
    async leaveProject(projectId: string) {
        try {
            const user = this.authStateService.user();
            if(!user) return;
            await leaveProject(projectId, user.id);
            this.router.navigate(['/home/projects']);
        } catch (error) {
            console.error('プロジェクトを抜けれませんでした', error);
            return;
        }
    }
}

