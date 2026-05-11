import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {
    getComments,
    getSubTasks,
    getTask,
    getUsers,
    getUser,
    getProjectTaskAssignableUsers,
    getTeamTaskAssignableUsers,
} from '../firestore';
import { Task } from '../types/task';
import { TeamMember } from '../types/team';
import { Project } from '../types/project';
import { AuthStateService } from './auth-state.service';

type ModalType =
'task-edit' | 
'task-add' | 
'project-edit' |
'team-edit' |
'project-invite' |
'notification-detail' |
'project-add-task' |
'team-task-detail' |
null;

export interface ModalState {
    isOpen: boolean;
    type: ModalType;
    data: any;
}

@Injectable({
    providedIn: 'root',
})

export class ModalService {
    authState = inject(AuthStateService);

    private modalStateSubject = new BehaviorSubject<ModalState>({
        isOpen: false,
        type: null,
        data: null,
    });

    modalState$ = this.modalStateSubject.asObservable();

    async open(type: ModalType, data: any) {
        // モーダルのデータを取得
        data = await this.getTaskEditData(type, data);

        data = await this.enrichTeamEditMembers(type, data);
        data = await this.enrichProjectEditMembers(type, data);

        data = await this.enrichNotificationDetail(type, data);

        if (data) {
            const teamScopeId = data.teamId ?? (type === 'team-edit' ? data.id : null);
            if (data.projectId) {
                data.assignableUsers = await getProjectTaskAssignableUsers(data.projectId);
            } else if (teamScopeId) {
                data.assignableUsers = await getTeamTaskAssignableUsers(teamScopeId);
            } else {
                data.assignableUsers = [];
            }
        }

        // モーダルを開く
        this.modalStateSubject.next({
            isOpen: true,
            type,
            data,
        });
    }

    close() {
        this.modalStateSubject.next({
            isOpen: false,
            type: null,
            data: null,
        });
    }

    // タスク編集の場合に実行すること
    async getTaskEditData(type: ModalType, task: any) {
        try {
            if (type !== 'task-edit' && type !== 'team-task-detail') return task;
            // コメント、サブタスク、階層タスク、元のタスク名を取得
            const comments = await this.getComments(task.id);
            const subTasks = await this.getSubTasks(task.id);
            const hierarchyTask = await this.getSubTaskHierarchy(task.id);
            task.comments = comments;
            task.subTasks = subTasks;
            task.hierarchyTask = hierarchyTask;
            task.originalTitle = task.title;

            // 担当者名を取得
            if(task.assignedUid) {
                const assignedUser = await getUser(task.assignedUid);
                if(assignedUser) task.assignedUserName = assignedUser.userName;
            }
            return task;
        } catch (error) {
            console.error("タスク編集データ取得失敗: ", error);
            return null;
        }
    }
    // サブタスク
    async getSubTasks(taskId: string) {
        try {
            const subTasks = await getSubTasks(taskId);
            subTasks.forEach((subTask: Task) => {
                subTask.originalTitle = subTask.title;
            });
            return subTasks;
        } catch (error) {
            console.error("サブタスク取得失敗: ", error);
            return [];
        }
    }
  // サブタスクの階層を取得
    async getSubTaskHierarchy(taskId: string) {
        const hierarchy = [];

        let currentId: string | null = taskId;

        while(currentId) {
        const task: any = await getTask(currentId);
        hierarchy.unshift(task);

        currentId = task.parentTaskId;
        }
        hierarchy.pop();

        return hierarchy;
    }

    // コメント
    async getComments(taskId: string) {
        try {
        const comments = await getComments(taskId);
        return comments;
        } catch (error) {
        console.error("コメント取得失敗: ", error);
        return [];
        }
    }

    /** 通知詳細で送信者名を表示できるよう fromUid から補完 */
    async enrichNotificationDetail(type: ModalType, notification: any) {
        if (type !== 'notification-detail' || !notification?.fromUid) {
            return notification;
        }
        if (notification.fromName) return notification;
        try {
            const user = await getUser(notification.fromUid);
            if (user?.userName) notification.fromName = user.userName;
        } catch (e) {
            console.error('通知の送信者名取得失敗: ', e);
        }
        return notification;
    }

    /** チーム編集モーダル用: teamMembers に user を付与 */
    async enrichTeamEditMembers(type: ModalType, data: any) {
        if (type !== 'team-edit' || !data?.teamMembers?.length) {
            return data;
        }
        try {
            const members = data.teamMembers as TeamMember[];
            const users = await getUsers(members.map((m) => m.userId));
            users.forEach((user) => {
                const member = members.find((m) => m.userId === user.id);
                if (member) member.user = user;
            });
            return data;
        } catch (error) {
            console.error('チームメンバー情報の取得に失敗しました', error);
            return data;
        }
    }

    /** プロジェクト編集モーダル用: projectMembers に user を付与 */
    async enrichProjectEditMembers(type: ModalType, data: any) {
        if (type !== 'project-edit' || !data?.projectMembers?.length) {
            return data;
        }
        try {
            const project = data as Project;
            const users = await getUsers(
                project.projectMembers!.map((m) => m.userId),
            );
            project.projectMembers!.forEach((m) => {
                m.user = users.find((u) => u.id === m.userId) ?? null;
            });
            return project;
        } catch (error) {
            console.error('プロジェクトメンバー情報の取得に失敗しました', error);
            return data;
        }
    }

    // 担当者候補の取得
    async getAssignableUsers(type: ModalType, task: Task) {
        if(type !== 'task-edit' && type !== 'team-task-detail') return [];

        // 個人タスク
        if(!task.projectId && !task.teamId) {
            const user = this.authState.user();
            if(!user) return [];
            return [user];
        }
        return [];
    }
}
