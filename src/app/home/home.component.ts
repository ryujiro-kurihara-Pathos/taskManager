import { Component, ViewChildren, QueryList, ElementRef } from '@angular/core';
import { RouterLink, RouterLinkActive, Router, RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { watchAuthState, logout } from '../auth';
import { 
  addField, 
  addTask, 
  getMainTasks, 
  getTask,
  getAllTasks,
  updateTask, 
  deleteTask, 
  getSubTasks,
  addComment,
  isExistingCollection,
  getComments,
  deleteComment,
  searchTasks,
} from '../firestore';
import { TaskComponent } from './tasks/tasks.component';

type Priority = '高' | '中' | '低';
type Status = '未着手' | '進行中' | '保留' | '完了';

@Component({
  selector: 'app-home',
  imports: [ RouterLink, RouterLinkActive, RouterOutlet, FormsModule, CommonModule, TaskComponent ],
  templateUrl: './home.component.html',
})

export class HomeComponent {
  // サイドバー
  isSidebarOpen: boolean = true;
  // サイドバーにあるタブ
  sidebarTabs: 'tasks' | 'projects' | 'teams' = 'tasks';

  // 表示形式
  displayFormat: 'list' | 'board' | 'calendar' = 'list';

  // ユーザー情報
  userName: string = '';
  userEmail: string = '';
  userUid: string = '';
  // ログインしているかどうか
  isLoggedIn: boolean = false;

  // タスク
  isAddingTask: boolean = false;
  taskTitle: string = '';
  taskDueDate: string = '';
  taskStartDate: string = '';
  taskStatus: string = '';
  taskPriority: string = '';
  taskMemo: string = '';
  mainTasks: any[] = [];

  // タスク編集
  editingTask: any = null;
  selectedTaskIds: string[] = [];
  subTasks: any[] = [];
  subTaskHierarchy: any[] = [];

  // コメント
  commentContent: string = '';
  comments: any[] = [];

  // 検索
  searchQuery: string = '';
  searchedTasks: any[] = [];

  constructor(private router: Router) {}
  @ViewChildren('subTaskInput') subTaskInputs!: QueryList<ElementRef>;

  // フィールドを追加
  async addField(fieldName: string, fieldValue: any) {
    try {
      const tasks = await getAllTasks();
      for(const task of tasks) {
        await addField(task.id, fieldName, fieldValue);
      }
    } catch (error) {
      console.error("フィールド追加失敗: ", error);
    }
  }

  // サイドバーを開く・閉じる
  toggleSidebar() {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  // ユーザー情報
  // ログイン状態を監視
  ngOnInit() {
    watchAuthState((user) => {
      if(user) {
        this.isLoggedIn = true;
        this.userName = user.displayName || '';
        this.userEmail = user.email || '';
        this.userUid = user.uid || '';
        this.loadMainTasks();
      } else {
        this.isLoggedIn = false;
        this.userName = '';
        this.userEmail = '';
        this.userUid = '';
        this.mainTasks = [];
      }
    });
  }
  // ログアウト
  async onLogout() {
    try {
      await logout();
      this.router.navigate(['/login']);
    } catch (error) {
      console.error(error);
    }
  }

  // タスク
  // タスクモーダルを開く
  openAddTaskModal() {
    this.isAddingTask = true;
  }
  // タスクモーダルを閉じる
  closeAddTaskModal() {
    this.isAddingTask = false;
  }
  // タスク追加
  async addTask() {
    if(!this.taskTitle) return;

    try {
      await addTask(
        this.userUid, {
          title: this.taskTitle,
          parentTaskId: this.editingTask ? this.editingTask.id : null,
          dueDate: this.taskDueDate,
          startDate: this.taskStartDate,
          status: this.taskStatus,
          priority: this.taskPriority,
          memo: this.taskMemo,
      });
      await this.loadMainTasks();
      this.isAddingTask = false;
      this.resetInputTask();
    } catch (error) {}
  }
  // 完了したタスクを取得
  getDoneTasks() {
    return this.mainTasks.filter(task => task.status === '完了');
  }
  // 未完了のタスクを取得
  getNotDoneTasks() {
    return this.mainTasks.filter(task => task.status !== '完了');
  }
  // 入力タスクをリセットする
  resetInputTask() {
    this.taskTitle = '';
    this.taskDueDate = '';
    this.taskStatus = '';
    this.taskPriority = '';
    this.taskMemo = '';
  }
  // タスクの読み込み
  async loadMainTasks() {
    try {
      this.mainTasks = await getMainTasks();
    } catch (error) {}
  }
  // タスク編集モーダルを開く
  async openEditTaskModal(taskId: string) {
    this.editingTask = await this.getEditingTask(taskId);
    this.subTasks = await this.getSubTasks();
    this.subTaskHierarchy = await this.getSubTaskHierarchy(taskId);
    this.comments = await this.getComments();
  }
  // タスク編集モーダルを閉じる
  async closeEditTaskModal() {
    this.editingTask = null;
    this.subTasks = [];
    await this.loadMainTasks();
  }
  // 編集するタスクを取得
  async getEditingTask(taskId: string) {
    try {
      const task = await getTask(taskId);
      return task;
    } catch (error) {
      console.error("タスク取得失敗: ", error);
      return null;
    }
  }
  // タスクを更新
  async updateTask(task: any) {
    try {
      await updateTask(task.id, {
        title: task.title,
        parentTaskId: null,
        dueDate: task.dueDate,
        startDate: task.startDate,
        status: task.status,
        priority: task.priority,
        memo: task.memo,
      });
      await this.closeEditTaskModal();
    } catch (error) {
      console.error("タスク更新失敗: ", error);
    }
  }
  // タスクのフィールドを更新
  async updateTaskField(taskId: string, fieldName: string, value: string) {
    try {
      await updateTask(taskId, {
        [fieldName]: value,
      });
    } catch (error) {
      console.error("タスクフィールド更新失敗: ", error);
    }
  }
  // タスクを削除
  async deleteTask(taskId: string) {
    try {
      await deleteTask(taskId);
      await this.loadMainTasks();
      this.closeEditTaskModal();
    } catch (error) {
      console.error("タスク削除失敗: ", error);
    }
  }
  // タスク選択
  toggleTaskSelection(taskId: string) {
    if(this.selectedTaskIds.includes(taskId)) {
      this.selectedTaskIds = this.selectedTaskIds.filter(id => id !== taskId);
    } else {
      this.selectedTaskIds.push(taskId);
    }
  }
  // タスク一括削除
  async deleteSelectedTask() {
    try {
      for(const taskId of this.selectedTaskIds) {
        await deleteTask(taskId);
      }

      await this.loadMainTasks();
      this.selectedTaskIds = [];
    } catch (error) {
      console.error("タスク一括削除失敗: ", error);
    }
  }
  // サブタスクをタスクに追加
  async addSubTaskToTask(subTask: any) {
    try {
      await addTask(
        this.userUid, {
          title: subTask.title,
          parentTaskId: this.editingTask.id,
          dueDate: null,
          startDate: null,
          status: null,
          priority: null,
          memo: null,
        }
      );
    } catch (error) {
      console.error("サブタスクをタスクに追加失敗: ", error);
    }
  }
  // サブタスクの取得
  async getSubTasks() {
    try {
      const subTasks = await getSubTasks(this.editingTask.id);
      subTasks.forEach(subTask => {
        subTask.originalTitle = subTask.title;
      })
      return subTasks;
    } catch (error) {
      return [];
    }
  }
  // 入力するための空のサブタスクを追加
  addEmptySubTask() {
    this.subTasks.push({ id: crypto.randomUUID(), title: ''});

    setTimeout(() => {
      const inputs = this.subTaskInputs.toArray();
      const lastInput = inputs[inputs.length - 1];
      lastInput?.nativeElement.focus();
    })
  }
  // サブタスクを削除
  removeSubTask(subTask: any) {
    if(subTask.title !== '') return;
    this.subTasks = this.subTasks.filter(
      item => item.id !== subTask.id
    );
  }
  // サブタスクの更新
  async updateSubTask(subTask: any) {
    try {
      // 既存のタスクかどうか
      const isExisting = await isExistingCollection('tasks', subTask.id);
      if(isExisting) { // 既存の場合
        if(subTask.title === '') {
          subTask.title = subTask.originalTitle;
        } else {
          await updateTask(
            subTask.id, {
              title: subTask.title,
            }
          );
          subTask.originalTitle = subTask.title;
        }
      } else { // 新規の場合
        if(subTask.title === '') {
          this.removeSubTask(subTask);
        } else {
          await this.addSubTaskToTask(subTask);
          this.subTasks = await this.getSubTasks();
        }
      }
    } catch (error) {
      console.error('サブタスク更新失敗: ', error);
    }
  }
  // 編集中のタスクを変更する
  async changeEditingTask(task: any) {
    const isExisting = await isExistingCollection('tasks', task.id);
    if(!isExisting) return;
    try {
      this.editingTask = await getTask(task.id);
      this.subTasks = await this.getSubTasks();
      this.subTaskHierarchy = await this.getSubTaskHierarchy(task.id);
    } catch (error) {
      console.error("編集中のタスク変更失敗: ", error);
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
  // 状態別のタスク取得
  getTasksByStatus(status: string) {
    return this.mainTasks.filter(task => task.status === status);
  }

  // コメント
  // コメントの追加
  async addComment() {
    // タスクが既存ものなら更新、新規なら追加をする
    try {
      const comment = await addComment({
        uid: this.userUid,
        taskId: this.editingTask.id,
        content: this.commentContent,
      });
      this.comments.push(comment);
      this.commentContent = '';
    } catch (error) {
      console.error("コメント追加失敗: ", error);
    }
  }
  // コメントを取得
  async getComments() {
    try {
      const comments = await getComments(this.editingTask.id);
      return comments;
    } catch (error) {
      return [];
    }
  }

  // コメントを削除
  async deleteComment(commentId: string) {
    try {
      await deleteComment(commentId);
      this.comments = this.comments.filter(comment => comment.id !== commentId);
    } catch (error) {
      console.error("コメント削除失敗: ", error);
    }
  }

  // 検索
  // タスクの検索
  async searchTasks() {
    try {
      this.searchedTasks = await searchTasks(this.searchQuery);
    } catch (error) {
      this.searchedTasks = [];
    }
  }
  // タスクの検索をリセット
  resetSearchTasks() {
    if(this.searchQuery !== '') return;
    this.searchedTasks = [];
  }

  // 期限
  // 期限の状態を取得
  getDueDateStatus(dueDate: string | null, taskStatus: string) {
    if(taskStatus === '完了') return '';
    if(!dueDate) return '';

    const today = new Date();
    const due = new Date(dueDate);

    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);

    const diff = (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);

    if(diff < 0) {
      return 'overdue';
    }

    if(diff <= 2) {
      return 'near';
    }

    return '';
  }
}