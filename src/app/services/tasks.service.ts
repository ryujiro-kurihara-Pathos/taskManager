import { Injectable, signal, inject, computed } from '@angular/core';
import {
    getMainTasks, 
    getTask,
    existsNotification,
    addNotification,
 } from '../firestore';
import { FilterKey, SortKey, Task, initialTask } from '../types/task';
import { AuthStateService } from './auth-state.service';
import { AddNotificationInput } from '../types/notification';
import { User } from '../types/user';

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
    editingTask: Task = { 
        id: '',
        ...initialTask,
        createdAt: '',
        assignableUsers: [],
        comments: [],
        subTasks: [],
        hierarchyTask: [],
        originalTitle: '',
    };
    assignableUsers = signal<User[]>([]);

    // サブタスク
    subTasks: Task[] = [];
    subTaskHierarchy: Task[] = [];

    setTasks(tasks: Task[]) {
        this.tasks.set(tasks);
    }

    async clearTasks() {
        this.tasks.set([]);
        await this.loadMainTasks();
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

    todoTasks = computed(() =>
        this.tasks().filter(task => task.status === '未着手')
    );
    inProgressTasks = computed(() =>
        this.tasks().filter(task => task.status === '進行中')
    );
    onHoldTasks = computed(() =>
        this.tasks().filter(task => task.status === '保留')
    );
    doneTasks = computed(() =>
        this.tasks().filter(task => task.status === '完了')
    );

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
    
    // ソート
    sortKey: SortKey = null;
    filterKey: FilterKey = null;

    // フィルター
    priorityFilter: '高' | '中' | '低' | '未設定' | null = null;
    isPriorityFilterOpen: boolean = false;

    // 優先度
    togglePriorityFilter() {
      this.isPriorityFilterOpen = !this.isPriorityFilterOpen;
    }
    selectPriority(value: '高' | '中' | '低' | '未設定' | null) {
      this.priorityFilter = value;
      this.isPriorityFilterOpen = false;
    }
    clearPriorityFilter() {
      this.priorityFilter = null;
    }
    // 進捗
    progressFilter: '未着手' | '進行中' | '保留' | '完了' | null = null;
    isProgressFilterOpen: boolean = false;
    toggleProgressFilter() {
      this.isProgressFilterOpen = !this.isProgressFilterOpen;
    }
    selectProgress(value: '未着手' | '進行中' | '保留' | '完了' | null) {
      this.progressFilter = value;
      this.isProgressFilterOpen = false;
    }
    clearProgressFilter() {
      this.progressFilter = null;
    }
    // 期日
    dueDateFilter: '今日' | '明日' | '未設定' | null = null;
    isDueDateFilterOpen: boolean = false;
    toggleDueDateFilter() {
      this.isDueDateFilterOpen = !this.isDueDateFilterOpen;
    }
    selectDueDate(value: '今日' | '明日' | '未設定' | null) {
      this.dueDateFilter = value;
      this.isDueDateFilterOpen = false;
    }
    clearDueDateFilter() {
      this.dueDateFilter = null;
    }

    // 画面に表示するタスクを取得
    getDisplayTasks(status: 'notDone' | 'done') {
        // チームタスク、プロジェクトタスクは表示しない
        let tasks = this.tasks().filter(task => task.projectId === null && task.teamId === null);
        if(status === 'notDone') {
            tasks = tasks.filter(task => task.status !== '完了');
        } else {
            tasks = tasks.filter(task => task.status === '完了');
        }

        // フィルター
        if(this.priorityFilter) {
            if(this.priorityFilter === '未設定') {
                tasks = tasks.filter(task => task.priority === null);
            } else {
                tasks = tasks.filter(task => task.priority === this.priorityFilter);
            }
        }
        if(this.progressFilter) {
            tasks = tasks.filter(task => task.status === this.progressFilter);
        }
        if(this.dueDateFilter) {
            if(this.dueDateFilter === '未設定') {
                tasks = tasks.filter(task => task.dueDate === null);
            } else {
                tasks = tasks.filter(task => task.dueDate === this.dueDateFilter);
            }
        }

        // ソート
        if(this.sortKey) {
            tasks.sort((a, b) => {
                if(this.sortKey === 'dueDate') {
                    const aTime = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
                    const bTime = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
                    return aTime - bTime;
                } else if (this.sortKey === 'createdAt') {
                    const aTime = this.getTimeValue(a.createdAt);
                    const bTime = this.getTimeValue(b.createdAt);
                    return bTime - aTime;
                } else if (this.sortKey === 'updatedAt') {
                //     const aTime = a.updatedAt
                //     ? new Date(a.updatedAt).getTime()
                //     : 0;
          
                //   const bTime = b.updatedAt
                //     ? new Date(b.updatedAt).getTime()
                //     : 0;
          
                //   return bTime - aTime;
                }
                return 0;
            });
        }
        return tasks;
    }
    getTimeValue(value: any): number {
        if (!value) return 0;
      
        // Firestore Timestamp
        if (typeof value.toDate === 'function') {
          return value.toDate().getTime();
        }
      
        // { seconds, nanoseconds } 型っぽいオブジェクト
        if (typeof value.seconds === 'number') {
          return value.seconds * 1000;
        }
      
        // string / Date に一応対応
        const time = new Date(value).getTime();
        return Number.isNaN(time) ? 0 : time;
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

