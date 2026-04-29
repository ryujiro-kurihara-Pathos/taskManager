import { Injectable, signal, inject } from '@angular/core';
import {
    getMainTasks, 
    getTask,
    existsNotification,
    addNotification,
 } from '../firestore';
import { FilterKey, SortKey, Task } from '../types/task';
import { AuthStateService } from './auth-state.service';
import { AddNotificationInput } from '../types/notification';

@Injectable({
    providedIn: 'root'
})

export class TasksService {
    tasks = signal<Task[]>([]);
    authState = inject(AuthStateService);

    // 表示形式
    displayFormat: 'list' | 'board' | 'calendar' = 'list';

    // タスク追加モーダル
    isAddingTask: boolean = false;
    // タスク編集モーダル
    editingTask: Task | null = null;

    // サブタスク
    subTasks: Task[] = [];
    subTaskHierarchy: Task[] = [];

    // ソート・フィルター
    sortKey: SortKey = null;
    filterKey: FilterKey = null;

    setTasks(tasks: Task[]) {
        this.tasks.set(tasks);
    }

    clearTasks() {
        this.tasks.set([]);
    }

    addTask(task: Task) {
        this.tasks.update(current => [...current, task]);
    }

    deleteTask(taskId: string) {
        this.tasks.update(current =>
            current.filter(task => task.id !== taskId)
        );
    }

    updateTask(updatedTask: Task) {
        this.tasks.update(current =>
            current.map(task => task.id === updatedTask.id ? updatedTask : task)
        );
    }

    // タスクを読み込む
    async loadMainTasks() {
        try {
            const tasks = await getMainTasks(this.authState.uid);
            this.setTasks(tasks);
            this.createTaskDeadlineNotification(tasks);
        } catch (error) {
            console.error('タスク読み込み失敗: ', error);
        }
    }
    
    // 未完了のタスクを取得
    getNotDoneTasks() {
        let tasks = this.tasks().filter(task => task.status !== '完了');
        if(this.sortKey) {
            tasks.sort((a, b) => {
                if(this.sortKey === 'dueDate') {
                    const aTime = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
                    const bTime = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
                    return aTime - bTime;
                }
                return 0;
            });
        }
        return tasks;
    }
    // 完了したタスクを取得
    getDoneTasks() {
        return this.tasks().filter(task => task.status === '完了');
    }
    // 状態別のタスク取得
    getTasksByStatus(status: string) {
        return this.tasks().filter(task => task.status === status);
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
    // 入力するための空のサブタスクを追加
    addEmptySubTask() {
        this.subTasks.push({ id: crypto.randomUUID(), title: '' } as Task);
    }

      // 期日が近いタスクの通知
    async createTaskDeadlineNotification(tasks: Task[]) {
        try {
        // が近いタスクの取得
        for(const task of tasks) {
            // 完了タスクは通知しない
            if(task.status === '完了') continue;
            // 期日未設定タスクは通知しない
            if(!task.dueDate) continue;
            // 期日が明日でないなら通知しない
            if(!this.isDueDateTomorrow(task.dueDate)) continue;
            // 通知先の設定
            const recieverUid = task.assignedUid ?? task.uid;
            // 通知がすでにされているか
            const exists = await existsNotification(task.id, recieverUid);
            if(exists) continue;

            // 通知の作成
            const data: AddNotificationInput = {
              uid: recieverUid,
              type: 'task-deadline',
              title: '期日が近いタスクがあります',
              message: `「${task.title}」の期日が近いです。`,
              fromUid: undefined, // ここはアプリのuidを設定する
              sourceId: task.id,
              isRead: false,
              isImportant: true,
            };
            await addNotification(data);
        }
        } catch (error) {
        console.error('期限が近いタスクの通知作成失敗: ', error);
        }
    }
    // 期日が明日かどうか
    isDueDateTomorrow(dueDate: string) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        const due = new Date(dueDate);
        due.setHours(0, 0, 0, 0);
        return tomorrow.getTime() === due.getTime();
    }
}

