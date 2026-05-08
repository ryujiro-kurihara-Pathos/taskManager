import { Injectable, signal, inject, computed } from '@angular/core';
import {
    getMainTasks, 
    getTask,
    existsNotification,
    addNotification,
    getProject,
    getTagsByIds,
 } from '../firestore';
import { FilterKey, SortKey, Task, initialTask } from '../types/task';
import { AuthStateService } from './auth-state.service';
import { AddNotificationInput } from '../types/notification';
import { User } from '../types/user';
import { Tag } from '../types/task';

/** マイタスク画面 vs チーム詳細（TasksService.tasks のスコープ解釈） */
export type TaskListContext =
    | { mode: 'main' }
    | { mode: 'team'; teamId: string };

@Injectable({
    providedIn: 'root'
})

export class TasksService {
    tasks = signal<Task[]>([]);
    authState = inject(AuthStateService);

    /** 一覧・ボード・getDisplayTasks の対象タスク集合（既定: 個人のみ） */
    taskListContext = signal<TaskListContext>({ mode: 'main' });

    /** チーム詳細で tasks.component と同等 UI を表示するときに呼ぶ */
    setTaskListContextTeam(teamId: string) {
        this.taskListContext.set({ mode: 'team', teamId });
    }

    /** マイタスク等に戻るとき */
    setTaskListContextMain() {
        this.taskListContext.set({ mode: 'main' });
    }

    /** 一覧・検索対象となるタスク（コンテキストに応じて絞り込み） */
    private scopedTasksSource = computed(() => {
        const ctx = this.taskListContext();
        const all = this.tasks();
        if (ctx.mode === 'main') {
            return all.filter(
                (task) => task.projectId === null && task.teamId === null,
            );
        }
        return all.filter((task) => task.teamId === ctx.teamId);
    });
    // 表示形式
    displayFormat: 'list' | 'board' | 'calendar' = 'list';

    // タスク追加モーダル
    isAddingTask: boolean = false;
    // タスク編集モーダル
    editingTask: Task = { 
        id: '',
        ...initialTask,
        createdAt: '',
        updatedAt: '',
        assignableUsers: [],
        tags: [],
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
        this.setTaskListContextMain();
        this.tasks.set([]);
        this.displayFormat = 'list';
        await this.loadMainTasks();
    }

    // タスクを読み込む
    async loadMainTasks() {
        try {
            const tasks = await getMainTasks(this.authState.uid);
            // タグの取得
            tasks.forEach(async (task) => {
                const tags = await getTagsByIds(task.tagIds);
                task.tags = tags;
            });
            // 取得待ちの間にチーム詳細へ遷移した場合は一覧を上書きしない
            if (this.taskListContext().mode !== 'main') {
                return;
            }
            this.setTasks(tasks);

            // 期日が近いタスクの通知を作成
            await this.createTaskDeadlineNotification(tasks);
        } catch (error) {
            console.error('タスク読み込み失敗: ', error);
        }
    }

    addTaskToTasks(task: Task) {
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
        this.scopedTasksSource().filter((task) => task.status === '未着手'),
    );
    inProgressTasks = computed(() =>
        this.scopedTasksSource().filter((task) => task.status === '進行中'),
    );
    onHoldTasks = computed(() =>
        this.scopedTasksSource().filter((task) => task.status === '保留'),
    );
    doneTasks = computed(() =>
        this.scopedTasksSource().filter((task) => task.status === '完了'),
    );

    /** マイタスク画面の検索語（変更のたびに一覧・ボードなどが再計算される） */
    searchQuery = signal('');

    filteredTodoTasks = computed(() =>
        this.filterTasksBySearchQuery(this.todoTasks()),
    );
    filteredInProgressTasks = computed(() =>
        this.filterTasksBySearchQuery(this.inProgressTasks()),
    );
    filteredOnHoldTasks = computed(() =>
        this.filterTasksBySearchQuery(this.onHoldTasks()),
    );
    filteredDoneTasks = computed(() =>
        this.filterTasksBySearchQuery(this.doneTasks()),
    );

    /** Firestore が string 以外を返した場合にも対応。NFKC で全角半角などを揃えて日本語も一致させる */
    private normalizeForSearch(value: unknown): string {
        const s = value == null ? '' : String(value);
        try {
            return s.normalize('NFKC').trim().toLowerCase();
        } catch {
            return s.trim().toLowerCase();
        }
    }

    private filterTasksBySearchQuery(tasks: Task[]): Task[] {
        const q = this.normalizeForSearch(this.searchQuery());
        if (!q) return tasks;
        return tasks.filter((t) => {
            const title = this.normalizeForSearch(t.title);
            const memo = this.normalizeForSearch(t.memo);
            return title.includes(q) || memo.includes(q);
        });
    }
    
    // ソート
    sortKey: SortKey = null;
    filterKey: FilterKey = null;

    // フィルター
    priorityFilter: '高' | '中' | '低' | '未設定' | null = null;
    isPriorityFilterOpen: boolean = false;

    closeAllFilterMenus() {
      this.isPriorityFilterOpen = false;
      this.isProgressFilterOpen = false;
      this.isDueDateFilterOpen = false;
      this.isTagsFilterOpen = false;
    }

    // 優先度
    togglePriorityFilter() {
      if (this.isPriorityFilterOpen) {
        this.isPriorityFilterOpen = false;
        return;
      }
      this.closeAllFilterMenus();
      this.isPriorityFilterOpen = true;
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
      if (this.isProgressFilterOpen) {
        this.isProgressFilterOpen = false;
        return;
      }
      this.closeAllFilterMenus();
      this.isProgressFilterOpen = true;
    }
    selectProgress(value: '未着手' | '進行中' | '保留' | '完了' | null) {
      this.progressFilter = value;
      this.isProgressFilterOpen = false;
    }
    clearProgressFilter() {
      this.progressFilter = null;
    }
    // 期日
    dueDateFilter: '今日' | '明日' | '1週間' | '未設定' | null = null;
    isDueDateFilterOpen: boolean = false;
    toggleDueDateFilter() {
      if (this.isDueDateFilterOpen) {
        this.isDueDateFilterOpen = false;
        return;
      }
      this.closeAllFilterMenus();
      this.isDueDateFilterOpen = true;
    }
    selectDueDate(value: '今日' | '明日' | '1週間' | '未設定' | null) {
      this.dueDateFilter = value;
      this.isDueDateFilterOpen = false;
    }
    clearDueDateFilter() {
      this.dueDateFilter = null;
    }

    // タグ
    tagsFilter: string | null = null;
    isTagsFilterOpen: boolean = false;
    tags: Tag[] = [];

    toggleTagsFilter() {
      if (this.isTagsFilterOpen) {
        this.isTagsFilterOpen = false;
        return;
      }
      this.closeAllFilterMenus();
      this.isTagsFilterOpen = true;
    }
    selectTags(value: string | null) {
        this.tagsFilter = value;
        this.isTagsFilterOpen = false;
    }
    clearTagsFilter() {
      this.tagsFilter = null;
    }

    // 画面に表示するタスクを取得
    getDisplayTasks(status: 'notDone' | 'done') {
        let tasks = [...this.scopedTasksSource()];
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
            if(this.dueDateFilter === '今日') {
                tasks = tasks.filter(task => task.dueDate && this.isDueDateWithin(task.dueDate, 0));
            } else if(this.dueDateFilter === '明日') {
                tasks = tasks.filter(task => task.dueDate && this.isDueDateWithin(task.dueDate, 1));
            } else if(this.dueDateFilter === '1週間') {
                tasks = tasks.filter(task => task.dueDate && this.isDueDateWithin(task.dueDate, 7));
            } else if(this.dueDateFilter === '未設定') {
                tasks = tasks.filter(task => task.dueDate === null);
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
                    const aTime = a.updatedAt
                    ? new Date(a.updatedAt).getTime()
                    : 0;
          
                  const bTime = b.updatedAt
                    ? new Date(b.updatedAt).getTime()
                    : 0;
          
                  return bTime - aTime;
                }
                return 0;
            });
        }

        // 検索
        return this.filterTasksBySearchQuery(tasks);
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
            if(!this.isDueDateWithin(task.dueDate, 1)) continue;
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
    // 期日が指定した日付以内かどうか
    isDueDateWithin(dueDate: string, days: number) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const date = new Date(today);
        date.setDate(date.getDate() + days);
        date.setHours(0, 0, 0, 0);
        const due = new Date(dueDate);
        due.setHours(0, 0, 0, 0);
        return due.getTime() >= today.getTime() && due.getTime() <= date.getTime();
    }

    
    // 時間の表示を取得
    // 引数で日付までか時刻までかを指定できる
    displayTime(createdAt: unknown, type: 'date' | 'time' = 'time'): string {
        const timeMs = this.parseTimestamp(createdAt);
        if (timeMs === null) return '';

        if(type === 'date') {
            const now = Date.now();
            const diffMs = now - timeMs;
            if (diffMs < 0) return this.formatAbsolute(timeMs);

            if (diffMs < 60_000) return 'たった今';

            const minutes = Math.floor(diffMs / 60_000);
            if (minutes < 60) return `${minutes}分前`;

            const hours = Math.floor(diffMs / 3_600_000);
            if (hours < 24) return `${hours}時間前`;

            const days = Math.floor(diffMs / 86_400_000);
            if (days < 30) return `${days}日前`;

            const months = Math.floor(diffMs / 2_592_000_000);
            if (months < 12) return `${months}ヶ月前`;

            const years = Math.floor(diffMs / 31_536_000_000);
            return `${years}年前`;
        }

        return this.formatAbsolute(timeMs, type);
    }

    /** 今年なら「M/D HH:mm」、別年なら「YYYY/M/D HH:mm」（月日はゼロ埋めなし） */
    private formatAbsolute(timeMs: number, type: 'date' | 'time' = 'time'): string {
        const d = new Date(timeMs);
        const opts: Intl.DateTimeFormatOptions = {};
            opts.month = 'numeric';
            opts.day = 'numeric';
        if(type === 'time') {
            opts.hour = '2-digit';
            opts.minute = '2-digit';
            opts.hour12 = false;
        }
        if (d.getFullYear() !== new Date().getFullYear()) {
            opts.year = 'numeric';
        }
        return d.toLocaleString('ja-JP', opts);
    }
    // 時間の解析
    private parseTimestamp(value: unknown): number | null {
        if (value == null || value === '') return null;
        if (typeof value === 'object' && value !== null) {
        const v = value as { toDate?: () => Date; seconds?: number };
        if (typeof v.toDate === 'function') {
            const t = v.toDate().getTime();
            return Number.isNaN(t) ? null : t;
        }
        if (typeof v.seconds === 'number') {
            return v.seconds * 1000;
        }
        }
        const d = new Date(value as string);
        const t = d.getTime();
        return Number.isNaN(t) ? null : t;
    }
}