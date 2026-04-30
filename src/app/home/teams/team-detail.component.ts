import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Team, TeamMember } from '../../types/team';
import { AddTaskInput, Task, initialTask } from '../../types/task';
import { ActivatedRoute } from '@angular/router';
import { AuthStateService } from '../../services/auth-state.service';
import { ModalService } from '../../services/modal.service';
import { 
    getTeamById,
    getTeamMembersByTeamId,
    getTasksByTeamId,
    addTeamTask,
 } from '../../firestore';
import { TasksService } from '../../services/tasks.service';

 type TeamTaskTab = 'all' | 'active' | 'done' | 'overdue';

@Component({
    selector: 'app-team-detail',
    templateUrl: './team-detail.component.html',
    standalone: true,
    imports: [CommonModule, FormsModule],
})

export class TeamDetailComponent {
    private route = inject(ActivatedRoute);
    private authState = inject(AuthStateService);
    private modalService = inject(ModalService);
    tasksService = inject(TasksService);

    teamId = signal<string>('');
    team = signal<Team | null | undefined>(undefined);
    teamMembers = signal<TeamMember[]>([]);
    // tasks = signal<Task[]>([]);

    addingTeamTask: AddTaskInput = { ...initialTask };

    selectedTab: TeamTaskTab = 'all';

    async ngOnInit() {
        // チームIDを取得
        const teamId = this.route.snapshot.paramMap.get('teamId');
        if(!teamId) return;
        this.teamId.set(teamId);

        // チームを取得
        const teamData = await this.getTeamById(teamId);
        this.team.set(teamData);

        // チームメンバーを取得
        const teamMembersData = await this.getTeamMembersByTeamId(teamId);
        this.teamMembers.set(teamMembersData);

        // チームのタスクを取得
        const tasksData = await this.getTasksByTeamId(teamId);
        this.tasksService.setTasks(tasksData);
    }

    // タスクのタブを切り替える
    switchTab(tab: TeamTaskTab) {
        this.selectedTab = tab;
    }

    // signalに追加
    addSignalData(data: any, newData: any) {
        data.update((current: any[]) => [...current, newData]);
    }

    // チームIDからチームを取得
    async getTeamById(teamId: string) {
        try {
            const team = await getTeamById(teamId);
            return team;
        } catch (error) {
            console.error("チームを取得できませんでした", error);
            return null;
        }
    }

    // チームIDからチームメンバーを取得
    async getTeamMembersByTeamId(teamId: string) {
        try {
            const teamMembers = await getTeamMembersByTeamId(teamId);
            return teamMembers;
        } catch (error) {
            console.error("チームメンバーを取得できませんでした", error);
            return [];
        }
    }

    // チームIDからチームのタスクを取得
    async getTasksByTeamId(teamId: string) {
        try {
            const tasks = await getTasksByTeamId(teamId);
            return tasks;
        } catch (error) {
            console.error("チームのタスクを取得できませんでした", error);
            return [];
        }
    }

    // 完了タスクの取得
    getDoneTasks() {
        return this.tasksService.tasks().filter(task => task.status === '完了');
    }

    // 期日切れのタスクの取得
    getOverdueTasks() {
        return this.tasksService.tasks().filter(task => task.dueDate && new Date(task.dueDate) < new Date());
    }

    // チームタスクの追加
    async addTeamTask() {
        try {
            const uid = this.authState.user()?.id;
            if(!uid) return;
            if(!this.addingTeamTask.title) return;
            const newTask = await addTeamTask({
                ...this.addingTeamTask,
                teamId: this.teamId(),
                uid: uid,
            });
            if(!newTask) return;
            this.addSignalData(this.tasksService.tasks(), newTask);
            this.addingTeamTask = { ...initialTask };
        } catch (error) {
            console.error("チームタスクを追加できませんでした", error);
        }
    }

    // チームタスクの詳細モーダルを開く
    openTeamTaskDetailModal(task: Task) {
        this.modalService.open('team-task-detail', task);
        this.tasksService.editingTask = { ...task };
    }

    // 表示するチームタスク
    displayTeamTasks() {
        if(this.selectedTab === 'all') {
            return this.tasksService.tasks();
        } else if(this.selectedTab === 'active') {
            return this.tasksService.tasks().filter(task => task.status === '進行中' || task.status === '未着手');
        } else if(this.selectedTab === 'done') {
            return this.tasksService.tasks().filter(task => task.status === '完了');
        } else if(this.selectedTab === 'overdue') {
            return this.tasksService.tasks().filter(task => task.dueDate && new Date(task.dueDate) < new Date());
        }
        return [];
    }

    // チームメンバーの詳細モーダルを開く
    openTeamMemberDetailModal(members: TeamMember[]) {
        this.modalService.open('team-member-detail', members);
    }
}