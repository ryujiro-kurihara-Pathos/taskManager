import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { getComments, getSubTasks, getTask } from '../firestore';
import { Task } from '../types/task';

type ModalType =
'task-edit' | 
'task-add' | 
'project-invite' |
'project-member-list' |
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
    private modalStateSubject = new BehaviorSubject<ModalState>({
        isOpen: false,
        type: null,
        data: null,
    });

    modalState$ = this.modalStateSubject.asObservable();

    async open(type: ModalType, data: any) {
        if (type === 'task-edit') {
            data = await this.getTaskEditData(data);
        }
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
    async getTaskEditData(task: any) {
        try {
            const comments = await this.getComments(task.id);
            const subTasks = await this.getSubTasks(task.id);
            const hierarchyTask = await this.getSubTaskHierarchy(task.id);
            task.comments = comments;
            task.subTasks = subTasks;
            task.hierarchyTask = hierarchyTask;
            task.originalTitle = task.title;
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
}
