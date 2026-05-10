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
  updateTag,
  declineProjectInvite,
  getInviteStatus,
  updateProject,
  deleteProject,
  deleteProjectAllMembers,
  addProjectMember,
  getTargetIdFromInviteId,
  addTeamMember,
  getTags,
  deleteTag,
  updateTeam,
  deleteTeam as firestoreDeleteTeam,
  deleteTeamAllMembers as firestoreDeleteTeamAllMembers,
  removeTeamMember,
} from '../firestore';
import { AuthStateService } from '../services/auth-state.service';
import { TasksService } from '../services/tasks.service';
import { AuthService } from '../services/auth.service';
import { Task, Comment, AddTaskInput, initialTask, AddTagInput, Tag } from '../types/task';
import { ModalService, ModalState } from '../services/modal.service';
import { User } from '../types/user';
import { AddInviteInput, initialInviteInput } from '../types/Invite';
import { Project, AddProjectInput, ProjectMember, AddProjectMemberInput } from '../types/project';
import { AddTeamMemberInput, Team, AddTeamInput } from '../types/team';
import { isTaskCreator } from '../utils/task-permissions';

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

  searchQuery: string = '';
  searchedTasks: Task[] = [];

  // メールアドレスでユーザーを検索
  searchedUsers: User[] = [];

  @ViewChildren('subTaskInput') subTaskInputs!: QueryList<ElementRef<HTMLInputElement>>;

  ngOnInit() {
    this.modalService.modalState$.subscribe((state) => {
      this.modalState = state;

      if (state.isOpen && (state.type === 'task-edit' || state.type === 'team-task-detail')) {
        this.tagDefinitionsEditMode = false;
        const task = state.data as Task;
        this.tasksService.editingTask = { ...task, tagIds: task.tagIds ?? [] };
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
    } else if(type === 'project-invite' || type === 'project-edit' || type === 'team-edit' || type === 'team-member-detail') {
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
  // コメントの追加
  async addComment(taskId: string) {
    const root = this.modalState.data as Task | null;
    if (!root || root.id !== taskId || !isTaskCreator(root, this.authState.uid)) {
      return;
    }
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
    const root = this.modalState.data as Task | null;
    if (!root || !isTaskCreator(root, this.authState.uid)) return;
    try {
      await deleteComment(commentId);
      this.modalState.data.comments = this.modalState.data.comments.filter((comment: Comment) => comment.id !== commentId);
    } catch (error) {
      console.error("コメント削除失敗: ", error);
    }
  }

  // プロジェクト
  // プロジェクトへの招待
  /** @param closeModalAfterInvite 編集モーダル内から呼ぶときは false */
  async invite(type: 'project' | 'team', targetId: string, closeModalAfterInvite = true) {
    try {
      const isInvited = await invite(
        type,
        targetId,
        this.inviteEmail,
        this.authState.user()?.email ?? '',
        this.authState.uid,
      );
      if (!isInvited) return;
      this.inviteEmail = '';
      if (closeModalAfterInvite) {
        this.closeModal();
      }
    } catch (error) {
      console.error("招待失敗: ", error);
    }
  }

  /** プロジェクト詳細ヘッダーから移設：管理者以外がメンバーから外れる */
  async leaveProjectFromEdit(project: Project) {
    try {
      const uid = this.authState.uid;
      if (!uid) return;
      if (await isAdmin(uid, project.id)) return;
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
      this.inviteEmail = '';
      this.modalService.close();
    } catch (error) {
      console.error("プロジェクト編集保存失敗: ", error);
    }
  }

  async saveTeamEdit(team: Team) {
    try {
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
      await removeTeamMember(uid, team.id);
      this.closeModal();
      await this.router.navigate(['/home/teams']);
    } catch (error) {
      console.error('チームからの退出に失敗しました', error);
    }
  }

  async deleteTeamFromEdit(team: Team) {
    try {
      const uid = this.authState.uid;
      if (!uid || team.ownerId !== uid) return;
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
}
