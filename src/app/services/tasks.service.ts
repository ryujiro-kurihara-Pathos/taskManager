import { Injectable, signal, inject } from '@angular/core';
import {
    getMainTasks, 
    getTask,
 } from '../firestore';
import { FilterKey, SortKey, Task } from '../types/task';
import { AuthStateService } from './auth-state.service';

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
}

