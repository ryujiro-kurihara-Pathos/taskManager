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
  invite as firestoreInvite,
  deleteProjectMember,
  acceptInvite,
  addTag,
  updateTag,
  declineProjectInvite,
  getInviteStatus,
  updateProject,
  deleteProject,
  deleteProjectAllMembers,
  addProjectMember,
  getInvite,
  getInviteTargetDisplayName,
  addTeamMember,
  getTags,
  deleteTag,
  updateTeam,
  deleteTeam as firestoreDeleteTeam,
  deleteTeamAllMembers as firestoreDeleteTeamAllMembers,
  removeUserFromTeamAndTeamProjects,
  unreadNotification,
  getTeamById,
  getTeamMembersByTeamId,
  getProject,
  getProjectMembers,
} from '../firestore';
import { AuthStateService } from '../services/auth-state.service';
import { TasksService } from '../services/tasks.service';
import { AuthService } from '../services/auth.service';
import { Task, Comment, AddTaskInput, initialTask, AddTagInput, Tag } from '../types/task';
import { ModalService, ModalState } from '../services/modal.service';
import { ConfirmDialogService } from '../services/confirm-dialog.service';
import { ConfirmDialogComponent } from '../shared/confirm-dialog/confirm-dialog.component';
import { User } from '../types/user';
import { AddInviteInput, initialInviteInput } from '../types/Invite';
import { Project, AddProjectInput, ProjectMember, AddProjectMemberInput } from '../types/project';
import { AddTeamMemberInput, Team, AddTeamInput, TeamMember } from '../types/team';
import type { Notification } from '../types/notification';
import { isTaskCreator } from '../utils/task-permissions';
import { userAvatarInitial } from '../utils/user-avatar';
import {
  canDeleteProject,
  canDeleteTeam,
  canEditProjectBasics,
  canEditTeamBasics,
  canManageProjectMembers,
  canManageTeamMembers,
  effectiveProjectRole,
  effectiveTeamRole,
  memberRoleLabelJa,
  type MemberRole,
} from '../utils/member-permissions';

/** タスクモーダル用: 1行＝スコープラベル＋任意の名称（リンク可）＋役割ピル */
type TaskContextRoleRow = {
  scopeLabel: string;
  /** プロジェクト名・チーム名など */
  detail?: string;
  /** 名称クリック時の遷移先 */
  detailNavigate?: 'project' | 'team';
  detailId?: string;
  roleJa: string;
  role: MemberRole;
};

/** タスクモーダル用: プロジェクト課題では「プロジェクト」＋「所属チーム」の両方を出せる */
type TaskContextRoleUi = {
  rows: TaskContextRoleRow[];
};

@Component({
  selector: 'app-home',
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    FormsModule,
    CommonModule,
    ConfirmDialogComponent,
  ],
  templateUrl: './home.component.html',
})

export class HomeComponent {
  /** メンバーアイコン・サイドバー用（先頭1文字） */
  avatarLetter(name: string | null | undefined): string {
    return userAvatarInitial(name);
  }

  authState = inject(AuthStateService);
  authService = inject(AuthService);
  tasksService = inject(TasksService);
  modalService = inject(ModalService);
  readonly confirmDialog = inject(ConfirmDialogService);
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
  newTagName = '';
  newTagColor = '#5a7d52';
  /** タグ色はプリセットから選択（自由入力しない） */
  readonly tagColorPresets: string[] = [
    "red", // #EF4444
    "orange", // #F97316
    "yellow", // #EAB308
    "green", // #22C55E
    "teal", // #14B8A6
    "blue", // #3B82F6
    "indigo", // #6366F1
    "purple", // #A855F7
    "pink", // #EC4899
    "gray", // #6474B0
  ];
  addingSubTask: Task | null = null;
  commentContent: string = '';

  /** タグ一覧で「名前・色の定義」を編集するモード（追加／編集モーダル共通） */
  tagDefinitionsEditMode = false;

  selectNewTagColor(color: string) {
    this.newTagColor = color;
  }

  // プロジェクト
  inviteInput: AddInviteInput = initialInviteInput;
  inviteEmail: string = '';
  /** チーム招待時に付与するロール（承諾時に teamMembers に反映。owner は不可） */
  teamInviteRole: 'admin' | 'member' = 'member';

  /** タスク編集モーダル用: チーム／プロジェクトでの現在ユーザーの権限（個人タスクでは null） */
  taskContextRoleUi: TaskContextRoleUi | null = null;
  private taskContextRoleLoadSeq = 0;
  /** 招待メール入力欄直下に表示するフィードバック（alert は使わない） */
  inviteFeedbackMessage = '';
  inviteFeedbackSuccess = false;

  /** プロジェクト編集モーダル: 基本情報の保存（owner のみ） */
  projectEditCanEditBasics = false;
  /** プロジェクト編集モーダル: メンバー招待・除外（owner / admin） */
  projectEditCanManageMembers = false;
  /** プロジェクト編集モーダル: プロジェクト削除（owner のみ） */
  projectEditCanDeleteProject = false;

  /** チーム編集モーダル: 名前・説明の保存（owner のみ） */
  teamEditCanEditBasics = false;
  /** チーム編集モーダル: メンバー招待・チームから除外（owner / admin） */
  teamEditCanManageMembers = false;
  /** チーム編集モーダル: チーム削除（teams.ownerId のみ） */
  teamEditCanDeleteTeam = false;

  searchQuery: string = '';
  searchedTasks: Task[] = [];

  // メールアドレスでユーザーを検索
  searchedUsers: User[] = [];

  /** 通知詳細（プロジェクト／チーム招待）で表示する招待先の名前 */
  notificationInviteTargetName = '';
  private inviteTargetLoadSeq = 0;

  @ViewChildren('subTaskInput') subTaskInputs!: QueryList<ElementRef<HTMLInputElement>>;

  ngOnInit() {
    this.modalService.modalState$.subscribe((state) => {
      this.modalState = state;

      if (!state.isOpen || state.type !== 'notification-detail') {
        this.notificationInviteTargetName = '';
      } else {
        const n = state.data as Notification;
        if (n?.type === 'project-invite' || n?.type === 'team-invite') {
          this.notificationInviteTargetName = '';
          if (n.sourceId) {
            void this.loadNotificationInviteTargetName(n.sourceId);
          }
        } else {
          this.notificationInviteTargetName = '';
        }
      }

      if (state.isOpen && state.type === 'project-edit' && state.data) {
        const p = state.data as Project;
        const uid = this.authState.uid;
        const members = p.projectMembers ?? [];
        this.projectEditCanEditBasics = canEditProjectBasics(p, members, uid);
        this.projectEditCanManageMembers = canManageProjectMembers(p, members, uid);
        this.projectEditCanDeleteProject = canDeleteProject(p, members, uid);
      } else {
        this.projectEditCanEditBasics = false;
        this.projectEditCanManageMembers = false;
        this.projectEditCanDeleteProject = false;
      }

      if (state.isOpen && state.type === 'team-edit' && state.data) {
        const t = state.data as Team & { teamMembers?: TeamMember[] };
        const uid = this.authState.uid;
        const members = t.teamMembers ?? [];
        this.teamEditCanEditBasics = canEditTeamBasics(t, members, uid);
        this.teamEditCanManageMembers = canManageTeamMembers(t, members, uid);
        this.teamEditCanDeleteTeam = canDeleteTeam(t, uid);
      } else {
        this.teamEditCanEditBasics = false;
        this.teamEditCanManageMembers = false;
        this.teamEditCanDeleteTeam = false;
      }

      if (state.isOpen && (state.type === 'task-edit' || state.type === 'team-task-detail')) {
        this.tagDefinitionsEditMode = false;
        const task = state.data as Task;
        this.tasksService.editingTask = { ...task, tagIds: task.tagIds ?? [] };
        void this.loadTaskContextRoleForTask(task);
      } else if (
        !state.isOpen ||
        (state.isOpen && state.type !== 'task-edit' && state.type !== 'team-task-detail')
      ) {
        this.taskContextRoleUi = null;
      }
      if (
        state.isOpen &&
        (state.type === 'task-add' || state.type === 'project-add-task')
      ) {
        this.tagDefinitionsEditMode = false;
      }
    });
    this.authService.watchAuthState(user => {
      const uid = user?.uid;
      if(uid) {
        this.loadTaskTags(uid);
      }
    })
  }

  closeModal() {
    const type = this.modalState.type;
    this.tagDefinitionsEditMode = false;
    if(type === 'task-edit' || type === 'team-task-detail') {
      this.tasksService.editingTask = { ...initialTask as Task };
      this.taskContextRoleUi = null;
    } else if(type === 'project-invite' || type === 'project-edit' || type === 'team-edit') {
      this.inviteEmail = '';
      this.teamInviteRole = 'member';
      this.clearInviteFeedback();
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
      this.tasksService.addTaskToTasks(newTask as Task);

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
      const root = this.modalState.data as Task | null;
      if (!root || root.id !== taskId || !isTaskCreator(root, this.authState.uid)) {
        return;
      }
      const ok = await this.confirmDialog.confirm({
        title: 'この課題を削除しますか？',
        message:
          '子タスク・コメントもまとめて削除されます。この操作は取り消せません。',
      });
      if (!ok) return;
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
      if (!isTaskCreator(task, this.authState.uid)) return;
      await this.updateTask(task);
      this.closeModal();
    } catch (error) {
      console.error("タスク編集保存失敗: ", error);
    }
  }

  /** モーダル内で編集中の課題（階層切替後もそのタスクの作成者のみ） */
  canEditCurrentModalTask(): boolean {
    const t = this.tasksService.editingTask;
    return isTaskCreator(t, this.authState.uid);
  }

  /** ルート課題の削除（deleteChildrenTask の対象） */
  canDeleteRootModalTask(): boolean {
    const root = this.modalState.data as Task | null;
    return isTaskCreator(root, this.authState.uid);
  }

  isTaskModalReadOnly(): boolean {
    return !this.canEditCurrentModalTask();
  }

  /** タグ「定義編集」トグルは追加モーダルでは常に有効（編集モーダルは閲覧のみ時のみ無効） */
  isTagDefinitionsToggleDisabled(): boolean {
    const t = this.modalState.type;
    if (t === 'task-add' || t === 'project-add-task') return false;
    return this.isTaskModalReadOnly();
  }
  // タスクの更新
  async updateTask(task: Task) {
    if (!isTaskCreator(task, this.authState.uid)) return;
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
      const updatedTask = await updateTask(task.id, addTaskInput);
      this.tasksService.updateTask(updatedTask);
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
    if (!this.canEditCurrentModalTask()) return;
    const t = this.tasksService.editingTask;
    const cur = t.tagIds ?? [];
    if (checked && !cur.includes(tagId)) {
      t.tagIds = [...cur, tagId];
    } else if (!checked) {
      t.tagIds = cur.filter((id) => id !== tagId);
    }
  }

  toggleTagDefinitionsEdit() {
    if (
      (this.modalState.type === 'task-edit' || this.modalState.type === 'team-task-detail') &&
      !this.canEditCurrentModalTask()
    ) {
      return;
    }
    if (this.tagDefinitionsEditMode) {
      this.tagDefinitionsEditMode = false;
      const uid = this.authState.uid;
      if (uid) void this.loadTaskTags(uid);
    } else {
      this.tagDefinitionsEditMode = true;
    }
  }

  setTagDefinitionColor(tag: Tag, color: string) {
    tag.color = color;
  }

  async saveTagDefinition(tag: Tag) {
    const name = tag.name?.trim();
    if (!name) return;
    const color = tag.color?.trim() || this.tagColorPresets[0];
    try {
      await updateTag(tag.id, { name, color });
      tag.name = name;
      tag.color = color;
      this.patchTagInOpenTaskViews(tag);
    } catch (error) {
      console.error('タグ更新失敗: ', error);
    }
  }

  /** 開いているモーダル内のタスクに付いているタグ表示を更新 */
  private patchTagInOpenTaskViews(tag: Tag) {
    const apply = (tags: Tag[] | null | undefined) => {
      if (!tags) return;
      const i = tags.findIndex((t) => t.id === tag.id);
      if (i >= 0) tags[i] = { ...tags[i], name: tag.name, color: tag.color };
    };
    apply(this.tasksService.editingTask.tags ?? undefined);
    const data = this.modalState.data as Task | null;
    if (data?.tags) apply(data.tags);
    this.tasksService.tasks.update((tasks) =>
      tasks.map((task) => ({
        ...task,
        tags: task.tags
          ? task.tags.map((t) =>
                t.id === tag.id ? { ...t, name: tag.name, color: tag.color } : t,
            )
          : task.tags,
      })),
    );
  }

  // タグ
  // タグの取得
  async loadTaskTags(uid: string) {
    try {
      this.tasksService.allTaskTags = await getTags(uid) as Tag[];
    } catch (error) {
      console.error('タグ取得失敗: ', error);
    }
  }
  // タグの作成
  async createTag() {
    if (
      (this.modalState.type === 'task-edit' || this.modalState.type === 'team-task-detail') &&
      !this.canEditCurrentModalTask()
    ) {
      return;
    }
    const name = this.newTagName.trim();
    const uid = this.authState.uid;
    if (!name || !uid) return;
    try {
      const inputTag: AddTagInput = {
        name,
        color: this.newTagColor || this.tagColorPresets[0],
        createdByUid: uid,
        isDefault: false,
      };
      const newTag = await addTag(inputTag) as Tag;
      // this.tasksService.allTaskTags = [...this.tasksService.allTaskTags, newTag];
      this.tasksService.allTaskTags.push(newTag);
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

  async deleteTagDefinition(tag: Tag) {
    if (
      (this.modalState.type === 'task-edit' || this.modalState.type === 'team-task-detail') &&
      !this.canEditCurrentModalTask()
    ) {
      return;
    }
    const ok = await this.confirmDialog.confirm({
      title: 'このタグを削除しますか？',
      message:
        'タグ定義が削除され、課題に付いている当該タグも外れます。よろしいですか？',
    });
    if (!ok) return;
    try {
      const isDeleted = await deleteTag(tag.id);
      if(isDeleted) {
        this.tasksService.allTaskTags = this.tasksService.allTaskTags.filter((t) => t.id !== tag.id);
        const tasks = await this.tasksService.loadTaskTags(this.tasksService.tasks() as Task[]);
        if(tasks) {
          this.tasksService.setTasks(tasks);
        }
      }

    } catch (error) {
      console.error('タグ削除失敗: ', error);
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
    const root = this.modalState.data as Task | null;
    if (!root || root.id !== taskId || !isTaskCreator(root, this.authState.uid)) {
      return;
    }
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
      const pid = subTask.parentTaskId;
      if (!pid) {
        this.addingSubTask = null;
        return;
      }
      const parent = await getTask(pid);
      if (!parent || !isTaskCreator(parent, this.authState.uid)) {
        this.addingSubTask = null;
        return;
      }
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
    if (!isTaskCreator(task, this.authState.uid)) return;
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
      // tagIds が未設定のタスク（サブタスク等）でもテンプレ側で落ちないように補正
      this.tasksService.editingTask = { ...task, tagIds: task.tagIds ?? [] };
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
  /** 一覧表示用（古い順）。createdAt は Firestore Timestamp / Date / ISO に対応 */
  modalCommentsSorted(comments: Comment[] | null | undefined): Comment[] {
    if (!comments?.length) return [];
    return [...comments].sort(
      (a, b) => this.commentCreatedAtMs(a.createdAt) - this.commentCreatedAtMs(b.createdAt),
    );
  }

  private commentCreatedAtMs(createdAt: unknown): number {
    if (createdAt == null) return 0;
    if (typeof createdAt === 'object' && createdAt !== null) {
      const v = createdAt as { toDate?: () => Date; seconds?: number };
      if (typeof v.toDate === 'function') {
        const t = v.toDate().getTime();
        return Number.isNaN(t) ? 0 : t;
      }
      if (typeof v.seconds === 'number') return v.seconds * 1000;
    }
    if (createdAt instanceof Date) {
      const t = createdAt.getTime();
      return Number.isNaN(t) ? 0 : t;
    }
    const d = new Date(createdAt as string);
    const t = d.getTime();
    return Number.isNaN(t) ? 0 : t;
  }

  /** コメント投稿者の表示名（モーダル内の担当候補から解決） */
  commentAuthorLabel(uid: string): string {
    if (!uid) return '不明';
    if (uid === this.authState.uid) return 'あなた';
    const users = this.tasksService.editingTask?.assignableUsers;
    const u = users?.find((x) => x.id === uid);
    if (u?.userName) return u.userName;
    return 'メンバー';
  }

  // コメントの追加
  async addComment(taskId: string) {
    const root = this.modalState.data as Task | null;
    if (!root || root.id !== taskId || !isTaskCreator(root, this.authState.uid)) {
      return;
    }
    const text = this.commentContent.trim();
    if (!text) return;
    try {
      const comment = await addComment({
        uid: this.authState.uid,
        taskId: taskId,
        content: text,
      });
      this.modalState.data.comments.push(comment);
      this.commentContent = '';
    } catch (error) {
      console.error('コメント追加失敗: ', error);
    }
  }
  // コメントの削除
  async deleteComment(commentId: string) {
    const root = this.modalState.data as Task | null;
    if (!root || !isTaskCreator(root, this.authState.uid)) return;
    const ok = await this.confirmDialog.confirm({
      title: 'このコメントを削除しますか？',
      message: '削除すると元に戻せません。',
    });
    if (!ok) return;
    try {
      await deleteComment(commentId);
      this.modalState.data.comments = this.modalState.data.comments.filter((comment: Comment) => comment.id !== commentId);
    } catch (error) {
      console.error("コメント削除失敗: ", error);
    }
  }

  clearInviteFeedback(): void {
    this.inviteFeedbackMessage = '';
    this.inviteFeedbackSuccess = false;
  }

  /** タスクに紐づくチーム／プロジェクトでの現在ユーザーの役割（個人タスクでは表示なし） */
  private async loadTaskContextRoleForTask(task: Task): Promise<void> {
    const seq = ++this.taskContextRoleLoadSeq;
    const uid = this.authState.uid;
    if (!uid) {
      this.taskContextRoleUi = null;
      return;
    }
    try {
      if (task.projectId) {
        const project = await getProject(task.projectId);
        if (seq !== this.taskContextRoleLoadSeq) return;
        if (!project) {
          this.taskContextRoleUi = null;
          return;
        }
        const members = await getProjectMembers(task.projectId);
        if (seq !== this.taskContextRoleLoadSeq) return;
        const rows: TaskContextRoleRow[] = [];
        const pr = effectiveProjectRole(project, members, uid);
        const pJa = memberRoleLabelJa(pr);
        if (pr && pJa) {
          const name = project.name?.trim();
          rows.push({
            scopeLabel: 'プロジェクト',
            detail: name || undefined,
            detailNavigate: 'project',
            detailId: project.id,
            roleJa: pJa,
            role: pr,
          });
        }
        if (project.teamId) {
          const team = await getTeamById(project.teamId);
          if (seq !== this.taskContextRoleLoadSeq) return;
          if (team) {
            const teamMembers = await getTeamMembersByTeamId(project.teamId);
            if (seq !== this.taskContextRoleLoadSeq) return;
            const tr = effectiveTeamRole(team, teamMembers, uid);
            const tJa = memberRoleLabelJa(tr);
            if (tr && tJa) {
              const teamName = team.name?.trim();
              rows.push({
                scopeLabel: '所属チーム',
                detail: teamName || undefined,
                detailNavigate: 'team',
                detailId: team.id,
                roleJa: tJa,
                role: tr,
              });
            }
          }
        }
        this.taskContextRoleUi = rows.length > 0 ? { rows } : null;
        return;
      }
      if (task.teamId) {
        const team = await getTeamById(task.teamId);
        if (seq !== this.taskContextRoleLoadSeq) return;
        if (!team) {
          this.taskContextRoleUi = null;
          return;
        }
        const members = await getTeamMembersByTeamId(task.teamId);
        if (seq !== this.taskContextRoleLoadSeq) return;
        const r = effectiveTeamRole(team, members, uid);
        const roleJa = memberRoleLabelJa(r);
        const teamName = team.name?.trim();
        this.taskContextRoleUi =
          r && roleJa
            ? {
                rows: [
                  {
                    scopeLabel: 'チーム',
                    detail: teamName || undefined,
                    detailNavigate: 'team',
                    detailId: team.id,
                    roleJa,
                    role: r,
                  },
                ],
              }
            : null;
        return;
      }
      if (seq !== this.taskContextRoleLoadSeq) return;
      this.taskContextRoleUi = null;
    } catch {
      if (seq !== this.taskContextRoleLoadSeq) return;
      this.taskContextRoleUi = null;
    }
  }

  /** 招待フィードバーを入力の変更で消す（成功直後にメール欄を空にしただけでは消さない） */
  onInviteEmailInput(value: string): void {
    if (!this.inviteFeedbackMessage) return;
    if (this.inviteFeedbackSuccess && value === '') return;
    this.clearInviteFeedback();
  }

  private showInviteFeedback(message: string, success: boolean): void {
    this.inviteFeedbackMessage = message;
    this.inviteFeedbackSuccess = success;
  }

  // プロジェクト
  // プロジェクトへの招待
  /** @param closeModalAfterInvite 編集モーダル内から呼ぶときは false */
  async invite(type: 'project' | 'team', targetId: string, closeModalAfterInvite = true) {
    this.clearInviteFeedback();
    const email = this.inviteEmail.trim();
    if (!email) {
      this.showInviteFeedback('メールアドレスを入力してください。', false);
      return;
    }
    try {
      const result = await firestoreInvite(
        type,
        targetId,
        email,
        this.authState.user()?.email ?? '',
        this.authState.uid,
        type === 'team' ? this.teamInviteRole : undefined,
      );
      if (result === 'user_not_found') {
        this.showInviteFeedback('ユーザーが存在しません。', false);
        return;
      }
      if (result === 'already_pending') {
        this.showInviteFeedback('すでに招待をしています（承認待ちです）。', false);
        return;
      }
      if (result === 'already_member') {
        this.showInviteFeedback('すでにメンバーです。', false);
        return;
      }
      if (result === 'failed') {
        this.showInviteFeedback(
          '招待できませんでした。権限や対象を確認するか、既に招待中の可能性があります。',
          false,
        );
        return;
      }
      this.showInviteFeedback('招待を受信トレイに通知しました。', true);
      this.inviteEmail = '';
      if (closeModalAfterInvite) {
        await new Promise((r) => setTimeout(r, 400));
        this.closeModal();
      }
    } catch (error) {
      console.error("招待失敗: ", error);
      this.showInviteFeedback('招待に失敗しました。', false);
    }
  }

  /** プロジェクト詳細ヘッダーから移設：管理者以外がメンバーから外れる */
  async leaveProjectFromEdit(project: Project) {
    try {
      const uid = this.authState.uid;
      if (!uid) return;
      if (canDeleteProject(project, project.projectMembers ?? [], uid)) return;
      await deleteProjectMember(uid, project.id);
      this.closeModal();
      await this.router.navigate(['/home/projects']);
    } catch (error) {
      console.error('プロジェクトからの退出に失敗しました', error);
    }
  }
  // そのメンバーが自分かどうか
  isMemberSelf(memberId: string) {
    return memberId === this.authState.uid;
  }
  // メンバーを削除
  async deleteProjectMemberFromEdit(targetUserId: string, projectId: string) {
    try {
      const project = this.modalState.data as Project;
      if (!canManageProjectMembers(project, project.projectMembers ?? [], this.authState.uid)) {
        return;
      }
      if (targetUserId === project.ownerId) {
        window.alert('プロジェクトオーナーはこの一覧から外せません。');
        return;
      }
      const ok = await this.confirmDialog.confirm({
        title: 'メンバーをプロジェクトから外しますか？',
        message:
          'このユーザーのプロジェクトへのアクセスが失われます。チームへの所属は維持されます。',
      });
      if (!ok) return;
      await deleteProjectMember(targetUserId, projectId);
      this.modalState.data.projectMembers = this.modalState.data.projectMembers?.filter(
        (member: ProjectMember) => member.userId !== targetUserId,
      );
    } catch (error) {
      console.error('メンバー削除失敗: ', error);
    }
  }

  /** チームから外す（チーム配下の全プロジェクトからも projectMembers を削除） */
  async removeTeamMemberFromEdit(targetUserId: string, teamId: string) {
    try {
      if (!this.teamEditCanManageMembers) return;
      const team = this.modalState.data as Team;
      if (targetUserId === team.ownerId) {
        window.alert('チームオーナーはこの一覧から外せません。');
        return;
      }
      const ok = await this.confirmDialog.confirm({
        title: 'メンバーをチームから外しますか？',
        message:
          'このチームに紐づく全プロジェクトからも外れ、チーム直下の共有課題にもアクセスできなくなります。',
      });
      if (!ok) return;
      await removeUserFromTeamAndTeamProjects(targetUserId, teamId);
      const data = this.modalState.data as Team & { teamMembers?: TeamMember[] };
      data.teamMembers = (data.teamMembers ?? []).filter((m) => m.userId !== targetUserId);
    } catch (error) {
      console.error('チームメンバー削除失敗: ', error);
    }
  }
  async saveProjectEdit(project: Project) {
    try {
      if (!this.projectEditCanEditBasics) return;
      const updateProjectInput: AddProjectInput = {
        name: project.name,
        ownerId: project.ownerId,
        visibility: project.visibility,
        description: project.description,
        teamId: project.teamId ?? null,
      }
      await updateProject(project.id, updateProjectInput);
      this.inviteEmail = '';
      this.modalService.close();
    } catch (error) {
      console.error("プロジェクト編集保存失敗: ", error);
    }
  }

  async saveTeamEdit(team: Team) {
    try {
      if (!this.teamEditCanEditBasics) return;
      const input: AddTeamInput = {
        name: team.name,
        ownerId: team.ownerId,
        description: team.description ?? '',
      };
      await updateTeam(team.id, input);
      this.inviteEmail = '';
      this.modalService.close();
    } catch (error) {
      console.error('チーム編集保存失敗: ', error);
    }
  }

  /** オーナー以外がチームから外れる */
  async leaveTeamFromEdit(team: Team) {
    try {
      const uid = this.authState.uid;
      if (!uid) return;
      if (team.ownerId === uid) return;
      await removeUserFromTeamAndTeamProjects(uid, team.id);
      this.closeModal();
      await this.router.navigate(['/home/teams']);
    } catch (error) {
      console.error('チームからの退出に失敗しました', error);
    }
  }

  async deleteTeamFromEdit(team: Team) {
    try {
      const uid = this.authState.uid;
      if (!uid || !canDeleteTeam(team, uid)) return;
      const ok = await this.confirmDialog.confirm({
        title: 'チームを削除しますか？',
        message:
          'チーム・メンバー・関連データはアプリ上から失われます。この操作は取り消せません。',
      });
      if (!ok) return;
      await firestoreDeleteTeamAllMembers(team.id);
      await firestoreDeleteTeam(team.id);
      this.closeModal();
      await this.router.navigate(['/home/teams']);
    } catch (error) {
      console.error('チーム削除失敗: ', error);
    }
  }
  async deleteProject(project: Project) {
    try {
      if (!this.projectEditCanDeleteProject) return;
      const ok = await this.confirmDialog.confirm({
        title: 'プロジェクトを削除しますか？',
        message:
          'プロジェクトに紐づく課題やメンバー情報などはアプリ上から失われます。この操作は取り消せません。',
      });
      if (!ok) return;
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
      const inviteDoc = await getInvite(invitedId);
      if (!inviteDoc?.targetId) return;

      // 招待を承諾する
      await acceptInvite(invitedId, this.authState.uid);

      // membersに追加する
      if(type === 'project') {
        const addProjectMemberInput: AddProjectMemberInput = {
          projectId: inviteDoc.targetId,
          userId: this.authState.uid,
          role: 'member',
        }
        await addProjectMember(addProjectMemberInput);
      } else if(type === 'team') {
        const role: 'admin' | 'member' =
          inviteDoc.teamMemberRole === 'admin' ? 'admin' : 'member';
        const addTeamMemberInput: AddTeamMemberInput = {
          teamId: inviteDoc.targetId,
          userId: this.authState.uid,
          role,
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

  notificationTypeLabel(type: string | undefined): string {
    switch (type) {
      case 'project-invite':
        return 'プロジェクト招待';
      case 'team-invite':
        return 'チーム招待';
      case 'task-deadline':
        return 'タスク・期限';
      default:
        return '通知';
    }
  }

  notificationIconModifier(type: string | undefined): string {
    switch (type) {
      case 'project-invite':
        return 'project';
      case 'team-invite':
        return 'team';
      case 'task-deadline':
        return 'deadline';
      default:
        return 'default';
    }
  }

  notificationSentAt(createdAt: unknown): string {
    return this.tasksService.displayTime(createdAt);
  }

  private async loadNotificationInviteTargetName(inviteId: string): Promise<void> {
    const seq = ++this.inviteTargetLoadSeq;
    try {
      const name = await getInviteTargetDisplayName(inviteId);
      if (seq !== this.inviteTargetLoadSeq) return;
      this.notificationInviteTargetName =
        name ?? '（不明）';
    } catch {
      if (seq !== this.inviteTargetLoadSeq) return;
      this.notificationInviteTargetName = '（不明）';
    }
  }

  notificationInviteEntityLabel(type: string | undefined): string {
    switch (type) {
      case 'project-invite':
        return 'プロジェクト名';
      case 'team-invite':
        return 'チーム名';
      default:
        return '';
    }
  }

  /** 自動通知以外の送信者表示用（名前は ModalService で fromUid から補完済みを想定） */
  notificationSenderRoleLabel(type: string | undefined): string {
    switch (type) {
      case 'project-invite':
      case 'team-invite':
        return '招待者';
      default:
        return '送信元';
    }
  }

  notificationSenderName(data: { fromName?: string; fromUid?: string | null }): string {
    if (data.fromName?.trim()) return data.fromName.trim();
    if (data.fromUid) return '名前を取得できませんでした';
    return '不明';
  }

  // 通知を未読にする
  async markAsUnread(notification: Notification) {
    try {
      const notificationId = notification.id;
      if (!notificationId) return;
      await unreadNotification(notificationId);
      this.modalState.data = { ...this.modalState.data, isRead: false };
      this.tasksService.patchNotification(notificationId, { isRead: false });
    } catch (error) {
      throw error;
    }
  }
}
