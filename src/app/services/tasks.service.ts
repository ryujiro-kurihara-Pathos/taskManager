import { Injectable, signal, inject } from '@angular/core';
import {
    getMainTasks, 
    getTask,
 } from '../firestore';
import { Task, AddTaskInput } from '../types/task';
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
            const tasks = await getMainTasks();
            this.setTasks(tasks);
        } catch (error) {
            console.error('タスク読み込み失敗: ', error);
        }
    }

    // 完了したタスクを取得
    getDoneTasks() {
        return this.tasks().filter(task => task.status === '完了');
    }
    // 未完了のタスクを取得
    getNotDoneTasks() {
        return this.tasks().filter(task => task.status !== '完了');
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

