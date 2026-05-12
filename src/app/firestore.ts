import { 
    collection,
    addDoc,
    getDocs,
    query,
    where,
    doc,
    getDoc,
    updateDoc,
    deleteDoc,
    documentId,
    onSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";
import { AddTaskInput, Task, AddTagInput, Tag } from "./types/task";
import { Project, AddProjectInput, AddProjectMemberInput, ProjectMember } from "./types/project";
import { Notification, AddNotificationInput } from "./types/notification";
import { AddTeamInput, AddTeamMemberInput, Team, TeamMember } from "./types/team";
import { User } from "./types/user";
import { Invite } from "./types/Invite";
import {
    canDeleteProject,
    canManageProjectMembers,
    canManageTeamMembers,
} from "./utils/member-permissions";

// フィールドの追加
export async function addField(taskID: string, fieldName: string, fieldValue: any) {
    try {
        await updateDoc(doc(db, 'tasks', taskID), {
            [fieldName]: fieldValue,
        });
    } catch(error) {
        throw error;
    }
}

// ユーザー
export async function getUser(userId: string) {
    try {
        const userRef = doc(db, 'users', userId);
        const snapshot = await getDoc(userRef);
        if(!snapshot.exists()) return null;
        const user = {
            id: snapshot.id,
            ...snapshot.data(),
        } as User;
        return user;
    } catch (error) {
        throw error;
    }
}
export async function getUsers(userIds: string[]) {
    try {
        const users: User[] = [];
        for (const userId of userIds) {
            const user = await getUser(userId);
            if(!user) continue;
            users.push(user);
        }
        return users;
    } catch (error) {
        throw error;
    }
}

//タスク
// タスクを追加
export async function addTask(addTaskInput: AddTaskInput) {
    try {
        console.log(addTaskInput);
        const createdAt = new Date();
        const tags = await getTagsByIds(addTaskInput.tagIds);
        const taskDoc = await addDoc(collection(db, 'tasks'), {
            ...addTaskInput,
            createdAt: createdAt,
        });
        const task = {
            id: taskDoc.id,
            ...addTaskInput,
            createdAt: createdAt.toISOString(),
            updatedAt: createdAt.toDateString(),
            assignableUsers: [],
            tags: tags,
            comments: [],
            subTasks: [],
            hierarchyTask: [],
            originalTitle: addTaskInput.title,
            projectId: addTaskInput.projectId ?? null,
            teamId: addTaskInput.teamId ?? null,
        } as Task;
        return task;
    } catch (error) {
        throw error;
    }
}
// メインタスクを取得
export async function getMainTasks(uid: string) {
    try {
        // メインタスクのクエリを作成
        const q = query(
            collection(db, 'tasks'),
            where('uid', '==', uid),
            where('parentTaskId', '==', null),
            where('projectId', '==', null),
        );
        // メインタスクの取得
        const snapshot = await getDocs(q);
        // タスクデータを入れるための配列
        const mainTasks: any[] = [];

        // タスクデータを配列に格納
        snapshot.forEach((doc) => {
            mainTasks.push({ id: doc.id, ...doc.data() } as Task);
        });

        return mainTasks;
    } catch (error) {
        throw error;
    }
}

/**
 * マイタスク（個人スコープ）用: トップレベル・非プロジェクト・非チームで、
 * ログインユーザーが作成者または担当者の課題（重複は id でマージ）。
 * Firestore の複合インデックスが必要になる場合があります（コンソールのリンクに従ってください）。
 */
export async function getPersonalInboxTasks(uid: string): Promise<Task[]> {
    try {
        const byId = new Map<string, Task>();
        const qCreator = query(
            collection(db, 'tasks'),
            where('parentTaskId', '==', null),
            where('projectId', '==', null),
            where('teamId', '==', null),
            where('uid', '==', uid),
        );
        const qAssignee = query(
            collection(db, 'tasks'),
            where('parentTaskId', '==', null),
            where('projectId', '==', null),
            where('teamId', '==', null),
            where('assignedUid', '==', uid),
        );
        const [snapA, snapB] = await Promise.all([
            getDocs(qCreator),
            getDocs(qAssignee),
        ]);
        snapA.forEach((d) =>
            byId.set(d.id, { id: d.id, ...d.data() } as Task),
        );
        snapB.forEach((d) =>
            byId.set(d.id, { id: d.id, ...d.data() } as Task),
        );
        return [...byId.values()];
    } catch (error) {
        throw error;
    }
}

/** プロジェクトにルート課題が1件でも未完了なら true */
export async function projectHasIncompleteRootTasks(
    projectId: string,
): Promise<boolean> {
    try {
        const tasks = await getTasksByProjectId(projectId);
        return tasks.some(
            (t) =>
                t.parentTaskId == null &&
                t.status !== '完了',
        );
    } catch {
        return false;
    }
}

/** ユーザーがメンバーであるプロジェクトのうち、未完了ルート課題が1件以上あるものの件数 */
export async function countActiveProjectsForUser(uid: string): Promise<number> {
    const projects = await getProjectsByUserId(uid);
    let n = 0;
    for (const p of projects) {
        if (await projectHasIncompleteRootTasks(p.id)) n++;
    }
    return n;
}

export type PersonalGoalProgressSummary = {
    goalCount: number;
    achievedCount: number;
    /** リンク済み課題が1件以上ある目標のみの平均完了率（0–100）。該当なしは null */
    averageLinkedTaskPercent: number | null;
    /** ゴール画面で詳細を開く推奨（未達成を優先） */
    primaryGoalId: string | null;
};

function goalUpdatedAtToString(v: unknown): string {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (
        typeof v === 'object' &&
        'toDate' in (v as object) &&
        typeof (v as { toDate: () => Date }).toDate === 'function'
    ) {
        return (v as { toDate: () => Date }).toDate().toISOString();
    }
    return String(v);
}

export async function getPersonalGoalProgressSummary(
    uid: string,
): Promise<PersonalGoalProgressSummary> {
    const snap = await getDocs(
        query(
            collection(db, 'goals'),
            where('scope', '==', 'personal'),
            where('ownerId', '==', uid),
        ),
    );
    const goals: {
        id: string;
        status: string;
        updatedAt: string;
    }[] = [];
    snap.forEach((d) => {
        const data = d.data();
        goals.push({
            id: d.id,
            status: String(data['status'] ?? '未着手'),
            updatedAt: goalUpdatedAtToString(data['updatedAt']),
        });
    });
    if (goals.length === 0) {
        return {
            goalCount: 0,
            achievedCount: 0,
            averageLinkedTaskPercent: null,
            primaryGoalId: null,
        };
    }
    const achievedCount = goals.filter((g) => g.status === '達成').length;
    let sumPct = 0;
    let nLinked = 0;
    for (const g of goals) {
        const tSnap = await getDocs(
            query(collection(db, 'tasks'), where('goalId', '==', g.id)),
        );
        const list: Task[] = [];
        tSnap.forEach((d) =>
            list.push({ id: d.id, ...d.data() } as Task),
        );
        if (list.length === 0) continue;
        const done = list.filter((t) => t.status === '完了').length;
        sumPct += Math.round((100 * done) / list.length);
        nLinked++;
    }
    const sorted = [...goals].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
    );
    const primary =
        sorted.find((g) => g.status !== '達成')?.id ?? sorted[0]?.id ?? null;
    return {
        goalCount: goals.length,
        achievedCount,
        averageLinkedTaskPercent:
            nLinked > 0 ? Math.round(sumPct / nLinked) : null,
        primaryGoalId: primary,
    };
}

// ドキュメントIDからタスクを取得
export async function getTask(id: string) {
    try {
        const docRef = doc(db, 'tasks', id);
        const docSnap = await getDoc(docRef);

        if(docSnap.exists()) {
            return {id: docSnap.id, ...docSnap.data() } as Task;
        } else {
            console.log("タスクが存在しません");
            return null;
        }
    } catch (error) {
        throw error;
    }
}
// 全てのタスクを取得
export async function getAllTasks() {
    try {
        const q = query(collection(db, 'tasks'));
        const snapshot = await getDocs(q);
        const tasks: any[] = [];
        snapshot.forEach((doc) => {
            tasks.push({ id: doc.id, ...doc.data() } as Task);
        });
        return tasks;
    } catch (error) {
        throw error;
    }
}
// タスクを更新
export async function updateTask(taskId: string, inputTask: AddTaskInput) {
    try {
        const updatedAt = new Date().toISOString();
        const taskRef = doc(db, 'tasks', taskId);

        await updateDoc(taskRef, {
            ...inputTask,
            updatedAt: updatedAt,
        });

        if (inputTask.status === '完了') {
            await deleteTaskDeadlineNotificationsForTask(taskId);
        }

        const tags = await getTagsByIds(inputTask.tagIds);

        const task = {
            id: taskId,
            ...inputTask,
            updatedAt: updatedAt,
            tags: tags,
        } as Task;
        return task;
    } catch (error) {
        throw error;
    }
}
// タスクを削除
export async function deleteTask(taskId: string) {
    try {
        await deleteTaskDeadlineNotificationsForTask(taskId);
        const docRef = doc(db, 'tasks', taskId);
        await deleteDoc(docRef);
    } catch (error) {
        console.error("タスク削除失敗: ", error);
        throw error;
    }
}
export async function deleteChildrenTask(taskId: string) {
    try {
        const q = query(
            collection(db, 'tasks'),
            where('parentTaskId', '==', taskId),
        );

        const snapshot = await getDocs(q);

        for (const childDoc of snapshot.docs) {
            await deleteChildrenTask(childDoc.id);
        }
        await deleteTask(taskId);
    } catch (error) {
        throw error;
    }
}
// サブタスクの取得
export async function getSubTasks(editingTaskId: string) {
    try {
        const q = query(
            collection(db, 'tasks'),
            where('parentTaskId', '==', editingTaskId),
        );
        const snapshot = await getDocs(q);
        const subTasks: any[] = [];
        snapshot.forEach((doc) => {
            subTasks.push({ id: doc.id, ...doc.data() } as Task);
        });
        return subTasks;
    } catch (error) {
        throw error;
    }
}
// 既存のコレクションかどうか
export async function isExistingCollection(collectionName: string, taskId: string) {
    try {
        const docRef = doc(db, collectionName, taskId);
        const docSnap = await getDoc(docRef);
        return docSnap.exists();
    } catch (error) {
        throw error;
    }
}
// タグの追加
export async function addTag(inputTag: AddTagInput) {
    try {
        const docRef = await addDoc(collection(db, 'tags'), {
            ...inputTag,
        });
        const tag = {
            id: docRef.id,
            ...inputTag,
        }
        return tag;
    } catch (error) {
        throw error;
    }
}

/** タグ名・色の更新（定義の編集） */
export async function updateTag(
    tagId: string,
    data: { name: string; color: string },
): Promise<void> {
    try {
        await updateDoc(doc(db, 'tags', tagId), {
            name: data.name,
            color: data.color,
        });
    } catch (error) {
        throw error;
    }
}
/** タグの削除（定義の編集） */
export async function deleteTag(tagId: string): Promise<boolean> {
    try {
        await deleteDoc(doc(db, 'tags', tagId));
        return true;
    } catch (error) {
        throw error;
    }
}

// タグを取得
export async function getTags(uid: string) {
    try {
        const q = query(collection(db, 'tags'), where('createdByUid', '==', uid));
        const snapshot = await getDocs(q);
        const tags: any[] = [];
        snapshot.forEach((doc) => {
            tags.push({ id: doc.id, ...doc.data() });
        });
        return tags;
    } catch (error) {
        throw error;
    }
}
// タグIDからタグを取得
export async function getTagsByIds(tagIds: string[]) {
    try {
        if(tagIds === undefined) return [];
        if(tagIds.length === 0) return [];
        const tagRef = collection(db, 'tags');
        const q = query(tagRef, where(documentId(), 'in', tagIds));
        const snapshot = await getDocs(q);
        const tags: Tag[] = [];
        snapshot.forEach((doc) => {
            tags.push({ id: doc.id, ...doc.data() } as Tag);
        });
        return tags;
    } catch (error) {
        throw error;
    }
}
// プロジェクトタスク担当者候補の取得
export async function getProjectTaskAssignableUsers(projectId: string) {
    try {
        const projectMemberRef = collection(db, 'projectMembers');
        const q = query(projectMemberRef, where('projectId', '==', projectId));
        const snapshot = await getDocs(q);
        const assignableUsers = await Promise.all(
            snapshot.docs.map(async (doc) => {
                const member = doc.data() as ProjectMember;
                return await getUser(member.userId);
            })
        )
        return assignableUsers.filter((user): user is User => user !== null);

    } catch (error) {
        throw error;
    }
}
// チームタスク担当者候補の取得
export async function getTeamTaskAssignableUsers(teamId: string) {
    try {
        const teamMemberRef = collection(db, 'teamMembers');
        const q = query(teamMemberRef, where('teamId', '==', teamId));
        const snapshot = await getDocs(q);
        const assignableUsers = await Promise.all(
            snapshot.docs.map(async (doc) => {
                const member = doc.data() as TeamMember;
                return await getUser(member.userId);
            })
        )
        return assignableUsers.filter((user): user is User => user !== null);
    } catch (error) {
        throw error;
    }
}


// コメント
// コメントを追加
export async function addComment(data: {
    uid: string,
    taskId: string,
    content: string,
}) {
    try {
        const docRef = await addDoc(collection(db, 'comments'), {
            ...data,
            createdAt: new Date(),
        });
        return {
            id: docRef.id,
            ...data,
            createdAt: new Date(),
        }
    } catch (error) {
        throw error;
    }
}
// コメントを取得
export async function getComments(taskId: string) {
    try {
        const q = query(
            collection(db, 'comments'),
            where('taskId', '==', taskId),
        );
        const snapshot = await getDocs(q);
        const comments: any[] = [];
        snapshot.forEach((doc) => {
            comments.push({ id: doc.id, ...doc.data() });
        });
        return comments;
    } catch (error) {
        throw error;
    }
}
// コメントを削除
export async function deleteComment(commentId: string) {
    try {
        const docRef = doc(db, 'comments', commentId);
        await deleteDoc(docRef);
    } catch (error) {
        throw error;
    }
}

// 検索
// タスクの検索
export async function searchTasks(searchQuery: string) {
    try {
        const q = query(
            collection(db, 'tasks'),
            where('title', '>=', searchQuery),
            where('title', '<=', searchQuery + '\uf8ff'),
        );
        const snapshot = await getDocs(q);
        const tasks: any[] = [];
        snapshot.forEach((doc) => {
            tasks.push({ id: doc.id, ...doc.data() } as Task);
        });
        return tasks;
    } catch (error) {
        throw error;
    }
}

// 招待
// InviteIdからtargetIdを取得
export async function getTargetIdFromInviteId(inviteId: string) {
    try {
        const inviteRef = doc(db, 'invites', inviteId);
        const inviteSnap = await getDoc(inviteRef);
        if(!inviteSnap.exists()) return null;
        const inviteData = inviteSnap.data() as Invite;
        return inviteData.targetId;
    } catch (error) {
        throw error;
    }
}

/** invites ドキュメントを取得（チーム招待の teamMemberRole など） */
export async function getInvite(inviteId: string): Promise<Invite | null> {
    try {
        const inviteSnap = await getDoc(doc(db, 'invites', inviteId));
        if (!inviteSnap.exists()) return null;
        return { id: inviteSnap.id, ...(inviteSnap.data() as Omit<Invite, 'id'>) };
    } catch (error) {
        throw error;
    }
}

/** 招待ドキュメントから、プロジェクト名またはチーム名を取得（通知詳細の表示用） */
export async function getInviteTargetDisplayName(inviteId: string): Promise<string | null> {
    try {
        const inviteRef = doc(db, 'invites', inviteId);
        const inviteSnap = await getDoc(inviteRef);
        if (!inviteSnap.exists()) return null;
        const inv = inviteSnap.data() as Partial<Invite>;
        const targetId = inv.targetId;
        if (!targetId) return null;
        if (inv.type === 'team') {
            const teamSnap = await getDoc(doc(db, 'teams', targetId));
            if (!teamSnap.exists()) return null;
            const name = (teamSnap.data() as { name?: string }).name;
            return name?.trim() || null;
        }
        const projectSnap = await getDoc(doc(db, 'projects', targetId));
        if (!projectSnap.exists()) return null;
        const name = (projectSnap.data() as { name?: string }).name;
        return name?.trim() || null;
    } catch (error) {
        console.error('getInviteTargetDisplayName failed', error);
        return null;
    }
}

// プロジェクト
// プロジェクトの追加
export async function addProject(input: AddProjectInput) {
    try {
        const createdAt = new Date();
        const docRef = await addDoc(collection(db, 'projects'), {
            name: input.name,
            ownerId: input.ownerId,
            visibility: input.visibility,
            description: input.description,
            teamId: input.teamId ?? null,
            createdAt: createdAt,
            updatedAt: createdAt,
        });
        const project = {
            id: docRef.id,
            ...input,
            createdAt: createdAt.toISOString(),
            updatedAt: createdAt.toISOString(),
        } as Project;

        return project;
    } catch (error) {
        return null;
    }
}
// 承認したユーザーをプロジェクトメンバーに加える
export async function addProjectMember(input: AddProjectMemberInput) {
    try {
        const createdAt = new Date();
        const docRef = await addDoc(collection(db, 'projectMembers'), {
            ...input,
            createdAt: createdAt,
        });
    } catch (error) {
        throw error;
    }
}
// プロジェクトメンバーを取得
export async function getProjectMembers(projectId: string) {
    try {
        const projectMemberRef = collection(db, 'projectMembers');
        const q = query(projectMemberRef, where('projectId', '==', projectId));
        const snapshot = await getDocs(q);
        const projectMembers: ProjectMember[] = [];
        snapshot.forEach((doc) => {
            projectMembers.push({
                id: doc.id,
                projectId: doc.data()['projectId'],
                userId: doc.data()['userId'],
                role: doc.data()['role'],
                createdAt: doc.data()['createdAt'],
            } as ProjectMember);
        })
        return projectMembers;
    } catch (error) {
        throw error;
    }
}
// プロジェクトを取得
export async function getProjectsByUserId(uid: string) {
    try {
        const memberRef = collection(db, 'projectMembers');
        const q = query(memberRef, where('userId', '==', uid));
        const snapshot = await getDocs(q);
        const projects: Project[] = [];
        const promises: Promise<void>[] = [];
        snapshot.forEach((doc) => {
            const projectId = doc.data()['projectId'];
            if (!projectId) return;

            promises.push(
                getProject(projectId).then((project) => {
                    if (project) projects.push(project);
                }),
            );
        });
        await Promise.all(promises);
        return projects;
    } catch (error) {
        throw error;
    }
}
// ドキュメントIDからプロジェクトを取得
export async function getProject(projectId: string): Promise<Project | null> {
    try {
        const docRef = doc(db, 'projects', projectId);
        const docSnap = await getDoc(docRef);
        if(!docSnap.exists()) return null;

        const data = docSnap.data();
        const project = {
            id: projectId,
            name: data['name'],
            ownerId: data['ownerId'],
            visibility: data['visibility'],
            description: data['description'],
            createdAt: data['createdAt'],
            updatedAt: data['updatedAt'],  
            teamId: data['teamId'] ?? null,
        } as Project;

        return project;

    } catch (error) {
        return null;
    }
}
// プロジェクトを更新
export async function updateProject(projectId: string, inputProject: AddProjectInput) {
    try {
        const projectRef = doc(db, 'projects', projectId);
        const projectResult = await updateDoc(projectRef, {
            ...inputProject,
            updatedAt: new Date(),
        });
        return projectResult;
    } catch (error) {
        throw error;
    }
}
// プロジェクトに所属するタスクを取得
export async function getTasksByProjectId(projectId: string) {
    try {
        const q = query(
            collection(db, 'tasks'),
            where('projectId', '==', projectId),
        );
        const snapshot = await getDocs(q);
        const tasks: Task[] = [];
        snapshot.forEach((doc) => {
            tasks.push({ id: doc.id, ...doc.data() } as Task);
        });
        return tasks;
    } catch (error) {
        return [];
    }
}

/** プロジェクト配下タスクのリアルタイム購読（モーダル保存・他端末の変更を一覧に反映） */
export function subscribeTasksByProjectId(
    projectId: string,
    onTasks: (tasks: Task[]) => void,
): () => void {
    const q = query(
        collection(db, 'tasks'),
        where('projectId', '==', projectId),
    );
    return onSnapshot(
        q,
        (snapshot) => {
            const tasks: Task[] = [];
            snapshot.forEach((d) => {
                tasks.push({ id: d.id, ...d.data() } as Task);
            });
            onTasks(tasks);
        },
        (error) => {
            console.error('プロジェクトタスクの購読に失敗しました', error);
            onTasks([]);
        },
    );
}

/** プロジェクト／チーム招待の結果（UI メッセージ用） */
export type SendInviteResult =
    | 'ok'
    | 'user_not_found'
    | 'already_pending'
    | 'failed'
    | 'already_member';

// プロジェクトへの招待（受信トレイ通知のみ。メールは送らない）
export async function invite(
    type: 'project' | 'team',
    targetId: string,
    inviteEmail: string,
    myEmail: string,
    invitedByUid: string, // 招待したユーザー
    /** type が team のときのみ有効。承諾時に teamMembers.role に使う（admin | member） */
    teamMemberRole?: 'admin' | 'member',
): Promise<SendInviteResult> {
    try {
        // メールアドレスが一致するユーザーが存在しない場合は招待しない
        const invitedUserRef = collection(db, 'users');
        const q = query(invitedUserRef, where('email', '==', inviteEmail));
        const snapshot = await getDocs(q);
        if (snapshot.empty) return 'user_not_found';
        const invitedUid = snapshot.docs[0].id;
        if (!invitedUid) return 'failed';

        // 自分のメールアドレスの場合falseを返す
        if (inviteEmail === myEmail) return 'failed';

        // すでにメンバーの場合は招待しない（プロジェクト／チームで参照コレクションを分ける）
        if (type === 'project') {
            const projectMemberRef = collection(db, 'projectMembers');
            const projectMemberQ = query(
                projectMemberRef,
                where('userId', '==', invitedUid),
                where('projectId', '==', targetId),
            );
            const projectMemberSnapshot = await getDocs(projectMemberQ);
            if (!projectMemberSnapshot.empty) return 'already_member';
        } else {
            const teamMemberRef = collection(db, 'teamMembers');
            const teamMemberQ = query(
                teamMemberRef,
                where('userId', '==', invitedUid),
                where('teamId', '==', targetId),
            );
            const teamMemberSnapshot = await getDocs(teamMemberQ);
            if (!teamMemberSnapshot.empty) return 'already_member';
        }

        // 招待したチームもしくはプロジェクトが存在しない場合は招待しない
        const targetRef = doc(db, type === 'project' ? 'projects' : 'teams', targetId);
        const targetSnap = await getDoc(targetRef);
        if (!targetSnap.exists()) return 'failed';

        const targetData = targetSnap.data() as Project | Team;
        if (type === 'project') {
            const project = targetData as Project;
            const members = await getProjectMembers(targetId);
            if (!canManageProjectMembers(project, members, invitedByUid)) return 'failed';
        } else {
            const team = targetData as Team;
            const members = await getTeamMembersByTeamId(targetId);
            if (!canManageTeamMembers(team, members, invitedByUid)) return 'failed';
        }

        const invitesRef = collection(db, 'invites');
        const existingInvitesQ = query(
            invitesRef,
            where('invitedUid', '==', invitedUid),
            where('targetId', '==', targetId),
        );
        const existingInvitesSnap = await getDocs(existingInvitesQ);
        const hasPendingSameTarget = existingInvitesSnap.docs.some(
            (d) =>
                d.data()['status'] === 'pending' &&
                d.data()['type'] === type,
        );
        if (hasPendingSameTarget) {
            return 'already_pending';
        }

        const resolvedTeamRole: 'admin' | 'member' =
            type === 'team' ? (teamMemberRole === 'admin' ? 'admin' : 'member') : 'member';

        // 辞退済みなど pending 以外の同一招待レコードがあれば更新、なければ新規作成（プロジェクト／チーム共通）
        const sameKindInvites = existingInvitesSnap.docs.filter(
            (d) => d.data()['type'] === type,
        );
        const resendInviteDoc = sameKindInvites.find(
            (d) => d.data()['status'] !== 'pending',
        );
        let inviteId: string | null = null;
        if (resendInviteDoc) {
            inviteId = resendInviteDoc.id;
            if (!inviteId) return 'failed';
            const patch: Record<string, unknown> = { status: 'pending' };
            if (type === 'team') {
                patch['teamMemberRole'] = resolvedTeamRole;
            }
            await updateDoc(doc(db, 'invites', inviteId), patch);
        } else {
            // invitesに招待情報を追加
            const basePayload: Record<string, unknown> = {
                type: type,
                targetId: targetId,
                invitedUid: invitedUid,
                invitedByUid: invitedByUid,
                status: 'pending',
                createdAt: new Date(),
                email: inviteEmail,
                isRead: false,
                isImportant: false,
            };
            if (type === 'team') {
                basePayload['teamMemberRole'] = resolvedTeamRole;
            }
            const inviteDoc = await addDoc(collection(db, 'invites'), basePayload);
            inviteId = inviteDoc.id;
        }
        // 招待を通知ドキュメントに追加
        const teamInviteMessage =
            resolvedTeamRole === 'admin'
                ? 'チーム招待があります（参加時の権限: 管理者）'
                : 'チーム招待があります（参加時の権限: メンバー）';
        await addNotification({
            uid: invitedUid,
            type: type === 'project' ? 'project-invite' : 'team-invite',
            title: type === 'project' ? 'プロジェクト招待' : 'チーム招待',
            message: type === 'project' ? 'プロジェクト招待があります' : teamInviteMessage,
            fromUid: invitedByUid,
            sourceId: inviteId,
            isRead: false,
            isImportant: false,
        });
        return 'ok';
    } catch (error) {
        throw error;
    }
}
/**
 * プロジェクトの「オーナー権限」（削除・オーナー専用操作）を持つか。
 * project.ownerId または projectMembers で role が owner。
 */
export async function isAdmin(uid: string, projectId: string) {
    try {
        const project = await getProject(projectId);
        if (!project) return false;
        const members = await getProjectMembers(projectId);
        return canDeleteProject(project, members, uid);
    } catch (error) {
        return false;
    }
}
// プロジェクトを削除
export async function deleteProject(projectId: string) {
    try {
        const projectRef = doc(db, 'projects', projectId);
        await deleteDoc(projectRef);
    } catch (error) {
        throw error;
    }
}
// プロジェクトメンバーを削除
export async function deleteProjectMember(deletedUid: string, projectId: string) {
    try {
        const projectMemberRef = collection(db, 'projectMembers');
        const q = query(
            projectMemberRef,
            where('projectId', '==', projectId),
            where('userId', '==', deletedUid),
        );
        const snapshot = await getDocs(q);
        await Promise.all(snapshot.docs.map((d) => deleteDoc(d.ref)));

        // projectInvitesのstatusをleftにする
        const projectInviteRef = collection(db, 'projectInvites');
        const projectInviteQuery = query(projectInviteRef, where('invitedUid', '==', deletedUid), where('projectId', '==', projectId));
        const projectInviteSnapshot = await getDocs(projectInviteQuery);
        if(projectInviteSnapshot.empty) return;
        const projectInviteId = projectInviteSnapshot.docs[0].id;
        if(!projectInviteId) return;
        await updateDoc(doc(projectInviteRef, projectInviteId), {
            status: 'left',
        });
        
    } catch (error) {
        throw error;
    }
}
export async function deleteProjectAllMembers(projectId: string) {
    try {
        const projectMemberRef = collection(db, 'projectMembers');
        const q = query(projectMemberRef, where('projectId', '==', projectId));
        const snapshot = await getDocs(q);
        snapshot.forEach(async (doc) => {
            await deleteDoc(doc.ref);
        });
        return true;
    } catch (error) {
        throw error;
    }
}
// projectInviteを承認に変更
export async function acceptInvite(inviteId: string, userId: string) {
    try {
        const inviteRef = doc(db, 'invites', inviteId);
        // inviteのデータを更新する
        await updateDoc(inviteRef, {
            status: 'accepted',
        });
    } catch (error) {
        throw new Error('招待の承認に失敗しました');
    }
}
// projectInviteの招待を拒否する
export async function declineProjectInvite(inviteId: string) {
    try {
        const inviteRef = doc(db, 'invites', inviteId);
        await updateDoc(inviteRef, {
            status: 'declined',
        });
    } catch (error) {
        throw new Error('招待の拒否に失敗しました');
    }
}
// inviteの招待状況を取得
export async function getInviteStatus(inviteId: string) {
    try {
        const inviteRef = doc(db, 'invites', inviteId);
        const inviteSnap = await getDoc(inviteRef);
        if(!inviteSnap.exists()) return null;
        const inviteData = inviteSnap.data() as Invite;
        return inviteData.status;
    } catch (error) {
        throw error;
    }
}
// プロジェクトタスクの数を取得
export async function getTaskCountByProjectId(projectId: string) {
    try {
        const taskRef = collection(db, 'tasks');
        const q = query(taskRef, where('projectId', '==', projectId));
        const snapshot = await getDocs(q);
        return snapshot.size;
    } catch (error) {
        throw error;
    }
}
// チームに紐づくプロジェクトを取得
export async function getProjectsByTeamId(teamId: string) {
    try {
        const projectRef = collection(db, 'projects');
        const q = query(projectRef, where('teamId', '==', teamId));
        const snapshot = await getDocs(q);
        const projects: Project[] = [];
        snapshot.forEach((doc) => {
            projects.push({ id: doc.id, ...doc.data() } as Project);
        });
        return projects;
    } catch (error) {
        throw error;
    }
}

// チームに紐づくタスク数を取得（teamId が一致する全タスク）
export async function getTaskCountByTeamId(teamId: string) {
    try {
        const taskRef = collection(db, 'tasks');
        const q = query(taskRef, where('teamId', '==', teamId));
        const snapshot = await getDocs(q);
        return snapshot.size;
    } catch (error) {
        throw error;
    }
}

// 受信トレイ
/** 課題が完了したときなど、当該課題の「期日が近い」通知をすべて削除（sourceId = taskId） */
export async function deleteTaskDeadlineNotificationsForTask(taskId: string): Promise<void> {
    try {
        const notificationRef = collection(db, 'notifications');
        const q = query(notificationRef, where('sourceId', '==', taskId));
        const snapshot = await getDocs(q);
        const deletes: Promise<void>[] = [];
        snapshot.forEach((d) => {
            const t = d.data()['type'];
            if (t === 'task-deadline') {
                deletes.push(deleteDoc(d.ref));
            }
        });
        await Promise.all(deletes);
    } catch (error) {
        console.error('期限通知の削除に失敗しました', error);
    }
}

// 通知の追加
export async function addNotification(data: AddNotificationInput) {
    try {
        await addDoc(collection(db, 'notifications'), {
            uid: data.uid,
            type: data.type,
            title: data.title,
            message: data.message,
            fromUid: data.fromUid ?? null,
            sourceId: data.sourceId,
            isRead: false,
            isImportant: data.isImportant ?? false,
            createdAt: new Date(),
        });
    } catch (error) {
        throw error;
    }
}
// 通知の取得
export async function getNotifications(uid: string) {
    try {
        const notificationRef = collection(db, 'notifications');
        const q = query(notificationRef, where('uid', '==', uid));
        const snapshot = await getDocs(q);
        if(snapshot.empty) return [];
        const notifications: Notification[] = [];
        snapshot.forEach((doc) => {
            notifications.push({
                id: doc.id,
                uid: doc.data()['uid'],
                type: doc.data()['type'],
                title: doc.data()['title'],
                message: doc.data()['message'],
                fromUid: doc.data()['fromUid'] ?? null,
                sourceId: doc.data()['sourceId'],
                isRead: doc.data()['isRead'],
                isImportant: doc.data()['isImportant'],
                createdAt: doc.data()['createdAt'],
            });
        })
        return notifications;
    } catch (error) {
        throw error;
    }
}
// 通知がされているかどうか
export async function existsNotification(sourceId: string, recieverUid: string) {
    try {
        const notificationRef = collection(db, 'notifications');
        const q = query(notificationRef, 
            where('sourceId', '==', sourceId),
            where('uid', '==', recieverUid),
        );
        const snapshot = await getDocs(q);
        if(snapshot.empty) return false;
        return true;
    } catch (error) {
        console.error('通知がされているかどうかの判定失敗: ', error);
        return false;
    }
}
// 通知を既読にする
export async function readNotification(notificationId: string) {
    try {
        const notificationRef = doc(db, 'notifications', notificationId);
        await updateDoc(notificationRef, {
            isRead: true,
        });
    } catch (error) {
        throw error;
    }
}
// 通知を未読にする
export async function unreadNotification(notificationId: string) {
    try {
        const notificationRef = doc(db, 'notifications', notificationId);
        await updateDoc(notificationRef, {
            isRead: false,
        });
    } catch (error) {
        throw error;
    }
}

// チーム
// チームの追加
export async function addTeam(addTeamInput: AddTeamInput) {
    try {
        const now = new Date();
        const teamDoc = await addDoc(collection(db, 'teams'), {
            ...addTeamInput,
            createdAt: now,
            updatedAt: now,
        });
        const team = {
            id: teamDoc.id,
            ...addTeamInput,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
        } as Team;
        return team;
    } catch (error) {
        throw error;
    }
}
// チームメンバーを追加
export async function addTeamMember(addTeamMemberInput: AddTeamMemberInput) {
    try {
        const createdAt = new Date();
        const teamMemberDoc = await addDoc(collection(db, 'teamMembers'), {
            ...addTeamMemberInput,
            createdAt: createdAt,
        });
        const teamMember = {
            id: teamMemberDoc.id,
            ...addTeamMemberInput,
            createdAt: createdAt,
        };
        return teamMember;
    } catch (error) {
        throw error;
    }
}

// チームを更新
export async function updateTeam(teamId: string, inputTeam: AddTeamInput) {
    try {
        const teamRef = doc(db, 'teams', teamId);
        await updateDoc(teamRef, {
            ...inputTeam,
            updatedAt: new Date(),
        });
    } catch (error) {
        throw error;
    }
}

// チームを削除
export async function deleteTeam(teamId: string) {
    try {
        await deleteDoc(doc(db, 'teams', teamId));
    } catch (error) {
        throw error;
    }
}

// チームに紐づく teamMembers をすべて削除
export async function deleteTeamAllMembers(teamId: string) {
    try {
        const teamMemberRef = collection(db, 'teamMembers');
        const q = query(teamMemberRef, where('teamId', '==', teamId));
        const snapshot = await getDocs(q);
        await Promise.all(snapshot.docs.map((d) => deleteDoc(d.ref)));
    } catch (error) {
        throw error;
    }
}

/** 指定ユーザーをチームメンバーから外す */
export async function removeTeamMember(userId: string, teamId: string) {
    try {
        const teamMemberRef = collection(db, 'teamMembers');
        const q = query(
            teamMemberRef,
            where('teamId', '==', teamId),
            where('userId', '==', userId),
        );
        const snapshot = await getDocs(q);
        await Promise.all(snapshot.docs.map((d) => deleteDoc(d.ref)));
    } catch (error) {
        throw error;
    }
}

/**
 * チームからユーザーを外し、そのチーム配下の全プロジェクトの projectMembers からも除く。
 * （プロジェクト単体の削除とは別。チーム所属の整合のため）
 */
export async function removeUserFromTeamAndTeamProjects(
    userId: string,
    teamId: string,
): Promise<void> {
    await removeTeamMember(userId, teamId);
    const projects = await getProjectsByTeamId(teamId);
    await Promise.all(
        projects.map(async (p) => {
            try {
                await deleteProjectMember(userId, p.id);
            } catch {
                // 当該プロジェクトに未参加の場合など
            }
        }),
    );
}

// ユーザーIDが所属しているチームIDを取得
export async function getTeamIdsByUserId(uid: string) {
    try {
        const teamMemberRef = collection(db, 'teamMembers');
        const q = query(teamMemberRef, where('userId', '==', uid));
        const snapshot = await getDocs(q);
        const teamIds: string[] = [];
        snapshot.forEach((doc) => {
            teamIds.push(doc.data()['teamId']);
        });
        return teamIds;
    } catch (error) {
        throw error;
    }
}
// チームIDからチームを取得
export async function getTeamById(teamId: string) {
    try {
        const teamRef = doc(db, 'teams', teamId);
        const snapshot = await getDoc(teamRef);
        if(!snapshot.exists()) return null;
        const team = {
            id: snapshot.id,
            ...snapshot.data(),
        } as Team;
        return team;
    } catch (error) {
        throw error;
    }
}
export async function getTeamsByIds(teamIds: string[]) {
    try {
        const teams: Team[] = [];
        for (const teamId of teamIds) {
            const team = await getTeamById(teamId);
            if(!team) continue;
            teams.push(team);
        }
        return teams;
    } catch (error) {
        throw error;
    }
}
// チームメンバーを取得
export async function getTeamMembersByTeamId(teamId: string) {
    try {
        const teamMemberRef = collection(db, 'teamMembers');
        const q = query(teamMemberRef, where('teamId', '==', teamId));
        const snapshot = await getDocs(q);
        const teamMembers: TeamMember[] = [];
        snapshot.forEach((doc) => {
            teamMembers.push({
                id: doc.id,
                teamId: doc.data()['teamId'],
                userId: doc.data()['userId'],
                role: doc.data()['role'],
                createdAt: doc.data()['createdAt'],
            } as TeamMember);
        });
        return teamMembers;
    } catch (error) {
        throw error;
    }
}
// チームタスクを取得
export async function getTasksByTeamId(teamId: string) {
    try {
        const taskRef = collection(db, 'tasks');
        const q = query(
            taskRef,
            where('teamId', '==', teamId),
            where('parentTaskId', '==', null),
            where('projectId', '==', null),
        );
        const snapshot = await getDocs(q);
        const tasks: Task[] = [];
        snapshot.forEach((doc) => {
            tasks.push({
                id: doc.id,
                ...doc.data(),
            } as Task);
        });
        return tasks;
    } catch (error) {
        throw error;
    }
}
// チームタスクの追加
export async function addTeamTask(addTaskInput: AddTaskInput) {
    try {
        const createdAt = new Date();
        const taskDoc = await addDoc(collection(db, 'tasks'), {
            ...addTaskInput,
            createdAt: createdAt,
        });
        const task = {
            id: taskDoc.id,
            ...addTaskInput,
            createdAt: createdAt.toISOString(),
        } as Task;
        return task;
    } catch (error) {
        throw error;
    }
}