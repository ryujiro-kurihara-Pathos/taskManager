import { Component, ViewChildren, QueryList, ElementRef, inject, effect, OnInit } from '@angular/core';
import { RouterLink, RouterLinkActive, Router, RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { 
  addField, 
  getAllTasks,
  searchTasks,
  addComment,
  deleteComment,
  isExistingCollection,
  updateTask,
  addTask,
  getSubTasks,
  getTask,
  deleteChildrenTask,
  inviteToProject,
  isAdmin,
} from '../firestore';
import { TaskComponent } from './tasks/tasks.component';
import { AuthStateService } from '../services/auth-state.service';
import { TasksService } from '../services/tasks.service';
import { AuthService } from '../services/auth.service';
import { Task, Comment, AddTaskInput, initialTask } from '../types/task';
import { ModalService, ModalState } from '../services/modal.service';
import { AddProjectInviteInput, initialProjectInviteInput } from '../types/project';  
import { logout } from '../auth';

@Component({
  selector: 'app-home',
  imports: [ RouterLink, RouterLinkActive, RouterOutlet, FormsModule, CommonModule, TaskComponent ],
  templateUrl: './home.component.html',
})

export class HomeComponent implements OnInit {
  authState = inject(AuthStateService);
  authService = inject(AuthService);
  tasksService = inject(TasksService);

  modalState: ModalState = {
    isOpen: false,
    type: null,
    data: null,
  };

  constructor(
    private router: Router,
    private modalService: ModalService
  ) {
    effect(() => {
      const user = this.authState.user();
      if(user) {
        this.tasksService.loadMainTasks();
      } else {
        this.tasksService.clearTasks();
      }
    });
  }

  ngOnInit() {
    this.modalService.modalState$.subscribe((state) => {
      this.modalState = state;
    });
  }

  closeModal() {
    this.modalService.close();
  }

  // タスク
  isSidebarOpen: boolean = true;
  sidebarTabs: 'tasks' | 'projects' | 'teams' = 'tasks';
  addingTask: AddTaskInput = { ...initialTask };
  addingSubTask: Task | null = null;
  commentContent: string = '';

  // プロジェクト
  projectInviteInput: AddProjectInviteInput = initialProjectInviteInput;
  inviteEmailOrUserName: string = '';

  searchQuery: string = '';
  searchedTasks: Task[] = [];

  @ViewChildren('subTaskInput') subTaskInputs!: QueryList<ElementRef<HTMLInputElement>>;

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
  // タスク追加
  async addTask() {
    try {
      const newTask = await addTask(this.authState.uid, this.addingTask);
      this.tasksService.addTask(newTask as Task);
      this.closeModal();
      this.addingTask = { ...initialTask };
    } catch (error) {
      console.error("タスク追加失敗: ", error);
    }
  }
  // タスクの削除
  async deleteTask(taskId: string) {
    try {
      await deleteChildrenTask(taskId);
      this.closeModal();
      this.tasksService.deleteTask(taskId);
    } catch (error) {
      console.error("タスク削除失敗: ", error);
    }
  }

  // タスクの更新
  async updateTask(task: Task) {
    try {
      await updateTask({
        title: task.title,
        parentTaskId: task.parentTaskId ?? null,
        projectId: task.projectId ?? null,
        dueDate: task.dueDate ?? null,
        startDate: task.startDate ?? null,
        status: task.status ?? null,
        priority: task.priority ?? null,
        memo: task.memo ?? null,
      }, task.id);
    } catch (error) {
      console.error("タスク更新失敗: ", error);
    }
  }

  // サブタスク
  // サブタスクの取得
  async getSubTasks(taskId: string) {
    try {
      const subTasks = await getSubTasks(taskId);
      return subTasks;
    } catch (error) {
      console.error("サブタスク取得失敗: ", error);
      return [];
    }
  }
  // 空のサブタスクを追加
  addEmptySubTask(taskId: string) {
    this.addingSubTask = { id: crypto.randomUUID(), title: '', parentTaskId: taskId } as Task;

    setTimeout(() => {
      const inputs = this.subTaskInputs.toArray();
      const lastInput = inputs[inputs.length - 1];
      lastInput?.nativeElement.focus();
    }, 0);
  }
  // サブタスクを追加
  async addSubTask(subTask: Task) {
    if(subTask.title.trim() === '') {
      this.addingSubTask = null;
    } else {
      const newSubTask = await this.addTaskToFirestore(subTask, 'subTask');
      this.modalState.data?.subTasks?.unshift(newSubTask);
      this.addingSubTask = null;
    }
  }

  // タスクをFirestoreに追加
  async addTaskToFirestore(task: Task, type: 'subTask' | 'mainTask') {
    try {
        const addTaskInput: AddTaskInput = {
            title: task.title,
            parentTaskId: type === 'subTask' ? task.parentTaskId ?? null : null,
            projectId: task.projectId ?? null,
            dueDate: task.dueDate ?? null,
            startDate: task.startDate ?? null,
            status: task.status ?? null,
            priority: task.priority ?? null,
            memo: task.memo ?? null,
        }
        const newTask = await addTask(task.id, addTaskInput);
        return newTask;
    } catch (error) {
        return null;
    }
  }
    // サブタスクの更新
  async updateTitle(task: Task) {
    try {
      if(task.title.trim() === '') {
        task.title = task.originalTitle;
      } else {
        await updateTask({
          title: task.title,
          parentTaskId: task.parentTaskId ?? null,
          projectId: task.projectId ?? null,
          dueDate: task.dueDate ?? null,
          startDate: task.startDate ?? null,
          status: task.status ?? null,
          priority: task.priority ?? null,
          memo: task.memo ?? null,
        }, task.id);
        task.originalTitle = task.title;
      }
    } catch (error) {
      console.error("タスクタイトル更新失敗: ", error);
    }
  }

  // サブタスクを削除
  removeSubTask(subTask: any) {
      // if(subTask.title !== '') return;
      // this.subTasks = this.subTasks.filter(
      //     item => item.id !== subTask.id
      // );
  }

  // editingTaskを変更する
  async changeEditingTask(task: Task) {
    const isExisting = await isExistingCollection('tasks', task.id);
    if(!isExisting) return;
    try {
      this.modalState.data = await getTask(task.id);
      this.modalState.data.subTasks = await this.getSubTasks(task.id);
      this.modalState.data.hierarchyTask = await this.modalService.getSubTaskHierarchy(task.id);
    } catch (error) {
      console.error("編集中のタスク変更失敗: ", error);
    }
  }

  // サブタスクをタスクに追加
  async addSubTaskToTask(subTask: any) {
      // try {
      //     const addTaskInput: AddTaskInput = {
      //         title: subTask.title,
      //         parentTaskId: this.editingTask?.id ?? null,
      //         projectId: this.editingTask?.projectId ?? null,
      //         dueDate: null,
      //         startDate: null,
      //         status: '未着手',
      //         priority: '中',
      //         memo: null,
      //     }
      // await addTask(this.authState.uid, addTaskInput);
      // } catch (error) {
      // console.error("サブタスクをタスクに追加失敗: ", error);
      // }
  }

  // // 検索
  // // タスクの検索
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

  // コメント
  // コメントの追加
  async addComment(taskId: string) {
    // タスクが既存ものなら更新、新規なら追加をする
    try {
      const comment = await addComment({
          uid: this.authState.uid,
          taskId: taskId,
          content: this.commentContent,
      });
      this.modalState.data.comments.push(comment);
      this.commentContent = '';
    } catch (error) {
    console.error("コメント追加失敗: ", error);
    }
  }

  async deleteComment(commentId: string) {
    try {
      await deleteComment(commentId);
      this.modalState.data.comments = this.modalState.data.comments.filter((comment: Comment) => comment.id !== commentId);
    } catch (error) {
      console.error("コメント削除失敗: ", error);
    }
  }

  // プロジェクト
  // プロジェクトへの招待
  async inviteToProject(projectId: string) {
    try {
      await inviteToProject(
        projectId,
        this.inviteEmailOrUserName,
        this.authState.user()?.email ?? '',
        this.authState.uid,
      );
      this.closeModal();
    } catch (error) {
      console.error("プロジェクトへの招待失敗: ", error);
    }
  }

  // そのメンバーが自分かどうか
  isMemberSelf(memberId: string) {
    return memberId === this.authState.uid;
  }

  // メンバーを削除
  async deleteMember(projectId: string) {
    try {
      // 管理者でないなら削除できない
      const isAdminUser = await isAdmin(this.authState.uid, projectId);
      if (!isAdminUser) return;
      // メンバーを削除
      
    } catch (error) {
      console.error("メンバー削除失敗: ", error);
    }
  }
}