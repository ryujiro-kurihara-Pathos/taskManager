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
  deleteProjectMember,
  acceptInvite,
  addTag,
  declineProjectInvite,
  getInviteStatus,
  updateProject,
  deleteProject,
  deleteProjectAllMembers,
  addProjectMember,
  getTargetIdFromInviteId,
  addTeamMember,
  getTags,
} from '../firestore';
import { AuthStateService } from '../services/auth-state.service';
import { TasksService } from '../services/tasks.service';
import { AuthService } from '../services/auth.service';
import { Task, Comment, AddTaskInput, initialTask, AddTagInput, Tag } from '../types/task';
import { ModalService, ModalState } from '../services/modal.service';
import { logout } from '../auth';
import { User } from '../types/user';
import { AddInviteInput, initialInviteInput } from '../types/Invite';
import { Project, AddProjectInput, ProjectMember, AddProjectMemberInput } from '../types/project';
import { AddTeamMemberInput } from '../types/team';

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
  taskTags: Tag[] = [];
  newTagName = '';
  newTagColor = '#5a7d52';
  addingSubTask: Task | null = null;
  commentContent: string = '';

  // プロジェクト
  inviteInput: AddInviteInput = initialInviteInput;
  inviteEmail: string = '';

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
        this.tasksService.editingTask = { ...task, tagIds: task.tagIds ?? [] };
        void this.loadTaskTags();
      } else if (state.isOpen && state.type === 'task-add') {
        void this.loadTaskTags();
      }
    });
  }

  closeModal() {
    const type = this.modalState.type;
    if(type === 'task-edit' || type === 'team-task-detail') {
      this.tasksService.editingTask = { ...initialTask as Task };
    } else if(type === 'project-invite' || type === 'team-member-detail') {
      this.inviteEmail = '';
    }
    this.modalService.close();
  }

  resetTask() {
    const task = this.modalState.data as Task;
    this.tasksService.editingTask = { ...task, tagIds: task.tagIds ?? [] };
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
  async addTask(type: 'myTasks' | 'projectTasks' | 'teamTasks') {
    try {
      // ログインが必要
      const uid = this.authState.uid;
      if(!uid) return;

      // ユーザーIDの設定
      this.addingTask.uid = uid;

      // プロジェクトIDの設定
      if(type === 'projectTasks') {
        console.log('modalState.data.id', this.modalState.data.id);
        this.addingTask.projectId = this.modalState.data.id;
      } else if(type === 'teamTasks') {
        this.addingTask.teamId = this.modalState.data.id;
      }

      // 担当者の設定
      if(!this.addingTask.teamId && !this.addingTask.projectId) {
        this.addingTask.assignedUid = uid;
      }

      // タスクの追加
      const newTask = await addTask(this.addingTask);
      if(!newTask) return;
      this.tasksService.addTask(newTask as Task);

      // モーダルを閉じる
      this.closeModal();

      // 追加タスクをリセット
      this.addingTask = { ...initialTask };
      this.newTagName = '';
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
      const addTaskInput: AddTaskInput = {
        uid: task.uid,
        title: task.title,
        parentTaskId: task.parentTaskId ?? null,
        projectId: task.projectId ?? null,
        dueDate: task.dueDate ?? null,
        startDate: task.startDate ?? null,
        status: task.status ?? null,
        priority: task.priority ?? null,
        memo: task.memo ?? null,
        assignedUid: task.assignedUid ?? null,
        teamId: task.teamId ?? null,
        tagIds: task.tagIds ?? [],
      }
      await updateTask(task.id, addTaskInput);
      this.tasksService.updateTask(task);
    } catch (error) {
      console.error("タスク更新失敗: ", error);
    }
  }
  toggleAddingTaskTag(tagId: string, checked: boolean) {
    const cur = this.addingTask.tagIds ?? [];
    if (checked && !cur.includes(tagId)) {
      this.addingTask = { ...this.addingTask, tagIds: [...cur, tagId] };
    } else if (!checked) {
      this.addingTask = { ...this.addingTask, tagIds: cur.filter((id) => id !== tagId) };
    }
  }
  toggleEditingTaskTag(tagId: string, checked: boolean) {
    const t = this.tasksService.editingTask;
    const cur = t.tagIds ?? [];
    if (checked && !cur.includes(tagId)) {
      t.tagIds = [...cur, tagId];
    } else if (!checked) {
      t.tagIds = cur.filter((id) => id !== tagId);
    }
  }

  // タグ
  // タグの取得
  async loadTaskTags() {
    const uid = this.authState.uid;
    if (!uid) return;
    try {
      this.taskTags = (await getTags(uid)) as Tag[];
    } catch (error) {
      console.error('タグ取得失敗: ', error);
    }
  }
  // タグの作成
  async createTag() {
    const name = this.newTagName.trim();
    const uid = this.authState.uid;
    if (!name || !uid) return;
    try {
      const inputTag: AddTagInput = {
        name,
        color: this.newTagColor || '#5a7d52',
        createdByUid: uid,
        isDefault: false,
      };
      const newTag = (await addTag(inputTag)) as Tag;
      this.taskTags = [...this.taskTags, newTag];
      if (this.modalState.type === 'task-edit' || this.modalState.type === 'team-task-detail') {
        const t = this.tasksService.editingTask;
        const cur = t.tagIds ?? [];
        if (!cur.includes(newTag.id)) {
          t.tagIds = [...cur, newTag.id];
        }
      } else {
        const cur = this.addingTask.tagIds ?? [];
        if (!cur.includes(newTag.id)) {
          this.addingTask = { ...this.addingTask, tagIds: [...cur, newTag.id] };
        }
      }
      this.newTagName = '';
    } catch (error) {
      console.error('タグ作成失敗: ', error);
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
            tagIds: task.tagIds ?? [],
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
  // コメントの削除
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
        this.inviteEmail,
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
  async deleteProjectMember(memberId: string, projectId: string) {
    try {
      // 管理者でないなら削除できない
      const isAdminUser = await isAdmin(this.authState.uid, projectId);
      if (!isAdminUser) return;
      // メンバーを削除
      await deleteProjectMember(memberId, projectId);
      // 表示するメンバーを更新
      this.modalState.data.projectMembers = this.modalState.data.projectMembers?.filter((member: ProjectMember) => member.id !== memberId);
    } catch (error) {
      console.error("メンバー削除失敗: ", error);
    }
  }
  async saveProjectEdit(project: Project) {
    try {
      const updateProjectInput: AddProjectInput = {
        name: project.name,
        ownerId: project.ownerId,
        visibility: project.visibility,
        description: project.description,
        teamId: project.teamId ?? null,
      }
      await updateProject(project.id, updateProjectInput);
      this.modalService.close();
    } catch (error) {
      console.error("プロジェクト編集保存失敗: ", error);
    }
  }
  async deleteProject(project: Project) {
    try {
      // プロジェクトを削除
      await deleteProject(project.id);

      // プロジェクトメンバーを削除
      await deleteProjectAllMembers(project.id);

      // モーダルを閉じる
      this.closeModal();

      // プロジェクト一覧に戻る
      this.router.navigate(['/home/projects']);
    } catch (error) {
      console.error("プロジェクト削除失敗: ", error);
    }
  }

  // 通知
  // 招待を承諾する
  async acceptInvite(invitedId: string, type: 'project' | 'team') {
    try {
      // 招待への承認がすでにある場合は承認できない
      const status = await getInviteStatus(invitedId);
      if (status !== 'pending') return;

      const uid = this.authState.uid;
      if (!uid) return;
      const targetId = await getTargetIdFromInviteId(invitedId);
      if (!targetId) return;

      // 招待を承諾する
      await acceptInvite(invitedId, this.authState.uid);

      // membersに追加する
      if(type === 'project') {
        const addProjectMemberInput: AddProjectMemberInput = {
          projectId: targetId,
          userId: this.authState.uid,
          role: 'member',
        }
        await addProjectMember(addProjectMemberInput);
      } else if(type === 'team') {
        const addTeamMemberInput: AddTeamMemberInput = {
          teamId: targetId,
          userId: this.authState.uid,
          role: 'member',
        }
        await addTeamMember(addTeamMemberInput);
      }
      this.closeModal();
    } catch (error) {
      throw error;
    }
  }
  // 招待を拒否する
  async declineInvite(projectInvitedId: string, type: 'project' | 'team') {
    try {
      const status = await getInviteStatus(projectInvitedId);
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
      const status = await getInviteStatus(projectInviteId);
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
