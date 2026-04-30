import { Component, ViewChildren, QueryList, ElementRef, inject } from '@angular/core';
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
  invite,
  isAdmin,
  deleteMember,
  acceptInvite,
  addProjectMember,
  getProjectIdFromProjectInviteId,
  declineProjectInvite,
  getProjectInviteStatus,
} from '../firestore';
import { AuthStateService } from '../services/auth-state.service';
import { TasksService } from '../services/tasks.service';
import { AuthService } from '../services/auth.service';
import { Task, Comment, AddTaskInput, initialTask } from '../types/task';
import { ModalService, ModalState } from '../services/modal.service';
import { logout } from '../auth';
import { User } from '../types/user';
import { AddInviteInput, initialInviteInput } from '../types/Invite';

@Component({
  selector: 'app-home',
  imports: [ RouterLink, RouterLinkActive, RouterOutlet, FormsModule, CommonModule ],
  templateUrl: './home.component.html',
})

export class HomeComponent {
  authState = inject(AuthStateService);
  authService = inject(AuthService);
  tasksService = inject(TasksService);
  modalService = inject(ModalService);
  router = inject(Router);

  modalState: ModalState = {
    isOpen: false,
    type: null,
    data: null,
  };

  // タスク
  isSidebarOpen: boolean = true;
  sidebarTabs: 'tasks' | 'projects' | 'teams' = 'tasks';
  addingTask: AddTaskInput = { ...initialTask };
  addingSubTask: Task | null = null;
  commentContent: string = '';

  // プロジェクト
  inviteInput: AddInviteInput = initialInviteInput;
  inviteEmailOrUserName: string = '';

  searchQuery: string = '';
  searchedTasks: Task[] = [];

  // メールアドレスでユーザーを検索
  searchedUsers: User[] = [];

  @ViewChildren('subTaskInput') subTaskInputs!: QueryList<ElementRef<HTMLInputElement>>;

  ngOnInit() {
    this.modalService.modalState$.subscribe((state) => {
      this.modalState = state;

      if (state.isOpen && state.type === 'task-edit') {
        const task = state.data as Task;

        // this.currentTask = task;

        this.tasksService.editingTask = { ...task };
      }
    });
  }

  closeModal() {
    const type = this.modalState.type;
    if(type === 'task-edit' || type === 'team-task-detail') {
      this.tasksService.editingTask = { ...initialTask as Task };
    } else if(type === 'project-invite' || type === 'team-member-detail') {
      this.inviteEmailOrUserName = '';
    }
    this.modalService.close();
  }

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
      const uid = this.authState.uid;
      if(!uid) return;
      this.addingTask.uid = uid;
      const newTask = await addTask(this.addingTask);
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

  // タスク編集モーダルで保存ボタンを押したときの処理
  async onSaveTaskEdit(task: Task) {
    try {
      await this.updateTask(task);
      this.closeModal();
    } catch (error) {
      console.error("タスク編集保存失敗: ", error);
    }
  }

  // タスクの更新
  async updateTask(task: Task) {
    try {
      await updateTask(task.id, {...task } as AddTaskInput);
      this.tasksService.updateTask(task);
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
            uid: this.authState.uid,
            title: task.title,
            parentTaskId: type === 'subTask' ? task.parentTaskId ?? null : null,
            dueDate: task.dueDate ?? null,
            startDate: task.startDate ?? null,
            status: task.status ?? null,
            priority: task.priority ?? null,
            memo: task.memo ?? null,
            projectId: task.projectId ?? null,
            teamId: task.teamId ?? null,
            assignedUid: task.assignedUid ?? null,
        }
        const newTask = await addTask(addTaskInput);
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
        await updateTask(
          task.id, {
          ...task as AddTaskInput,
        });
        task.originalTitle = task.title;
      }
    } catch (error) {
      console.error("タスクタイトル更新失敗: ", error);
    }
  }

  // editingTaskを変更する(モーダル内のタスクを変更する)
  async changeEditingTask(task: Task) {
    // タスクが追加されていない場合は変更できない
    const isExisting = await isExistingCollection('tasks', task.id);
    if(!isExisting) return;
    try {
      this.tasksService.editingTask = { ...task };
      await this.modalService.open('task-edit', this.tasksService.editingTask);
    } catch (error) {
      console.error("編集中のタスク変更失敗: ", error);
    }
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
  async invite(type: 'project' | 'team', targetId: string) {
    try {
      const isInvited = await invite(
        type,
        targetId,
        this.inviteEmailOrUserName,
        this.authState.user()?.email ?? '',
        this.authState.uid,
      );
      if (!isInvited) return;
      this.closeModal();
    } catch (error) {
      console.error("招待失敗: ", error);
    }
  }

  // そのメンバーが自分かどうか
  isMemberSelf(memberId: string) {
    return memberId === this.authState.uid;
  }

  // メンバーを削除
  async deleteMember(memberId: string, projectId: string) {
    try {
      // 管理者でないなら削除できない
      const isAdminUser = await isAdmin(this.authState.uid, projectId);
      if (!isAdminUser) return;
      // メンバーを削除
      await deleteMember(memberId, projectId);
      // 表示するメンバーを更新
      this.modalState.data.memberIds = this.modalState.data.memberIds.filter((id: string) => id !== memberId);
    } catch (error) {
      console.error("メンバー削除失敗: ", error);
    }
  }

  // 通知
  // 招待を承諾する
  async acceptInvite(invitedId: string) {
    try {
      // 招待への承認がすでにある場合は承認できない
      const status = await getProjectInviteStatus(invitedId);
      if (status !== 'pending') return;

      const uid = this.authState.uid;
      if (!uid) return;
      const projectId = await getProjectIdFromProjectInviteId(invitedId);
      if (!projectId) return;
      await acceptInvite(invitedId, this.authState.uid);
      await addProjectMember(projectId, this.authState.uid);
      this.closeModal();
    } catch (error) {
      throw error;
    }
  }
  // 招待を拒否する
  async declineInvite(projectInvitedId: string) {
    try {
      const status = await getProjectInviteStatus(projectInvitedId);
      if (status !== 'pending') return;

      const uid = this.authState.uid;
      if (!uid) return;
      
      await declineProjectInvite(projectInvitedId);
      this.closeModal();
    } catch (error) {
      throw error;
    }
  }
  // 招待状況を取得する
  async getInviteStatus(projectInviteId: string) {
    try {
      const status = await getProjectInviteStatus(projectInviteId);
      return status;
    } catch (error) {
      throw error;
    }
  }
  // 受信トレイからタスクへ移動
  async openTaskFromNotification() {
    try {
      const task = await getTask(this.modalState.data.sourceId);
      if(!task) return;

      this.closeModal();

      this.router.navigate(['/home/tasks']);
      this.modalService.open('task-edit', task);
    } catch (error) {
      console.error("受信トレイからタスクへ移動失敗: ", error);
    }
  }
}
