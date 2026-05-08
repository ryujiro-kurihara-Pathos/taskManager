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
} from "firebase/firestore";
import { db } from "./firebase";
import { AddTaskInput, Task, AddTagInput, Tag } from "./types/task";
import { Project, AddProjectInput, AddProjectMemberInput, ProjectMember } from "./types/project";
import { Notification, AddNotificationInput } from "./types/notification";
import { AddTeamInput, AddTeamMemberInput, Team, TeamMember } from "./types/team";
import { User } from "./types/user";
import { Invite } from "./types/Invite";

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
// プロジェクトへの招待
export async function invite(
    type: 'project' | 'team',
    targetId: string,
    inviteEmail: string,
    myEmail: string,
    invitedByUid: string, // 招待したユーザー
) {
    try {
        // メールアドレスが一致するユーザーが存在しない場合は招待しない
        const invitedUserRef = collection(db, 'users');
        const q = query(invitedUserRef, where('email', '==', inviteEmail));
        const snapshot = await getDocs(q);
        if(snapshot.empty) return false;
        const invitedUid = snapshot.docs[0].id;
        if(!invitedUid) return false;

        // 自分のメールアドレスの場合falseを返す
        if(inviteEmail === myEmail) return false;

        // 招待したチームもしくはプロジェクトが存在しない場合は招待しない
        const targetRef = doc(db, type === 'project' ? 'projects' : 'teams', targetId);
        const targetSnap = await getDoc(targetRef);
        if(!targetSnap.exists()) return false;

        // 招待したユーザーが管理者でない場合は招待しない
        const targetData = targetSnap.data() as Project | Team;
        if(targetData.ownerId !== invitedByUid) return false;

        // 以前招待をされていたかどうか
        const isPreviouslyInvitedResult: boolean = await isPreviouslyInvited(invitedUid, targetId);
        let inviteId: string | null = null;
        if(isPreviouslyInvitedResult) {
            // 招待の承認待ちの場合、招待をやめる
            const inviteRef = collection(db, 'invites');
            const q = query(inviteRef, where('invitedUid', '==', invitedUid), where('targetId', '==', targetId));
            const snapshot = await getDocs(q);
            if(snapshot.empty) return false;
            inviteId = snapshot.docs[0].id;
            if(!inviteId) return false;
            if(snapshot.docs[0].data()['status'] === 'pending') return false;
            // inviteの招待情報を変更
            await updateDoc(doc(db, 'invites', inviteId), {
                status: 'pending',
            });
        } else {
            // invitesに招待情報を追加
            const inviteDoc = await addDoc(collection(db, 'invites'), {
                type: type,
                targetId: targetId,
                invitedUid: invitedUid,
                invitedByUid: invitedByUid,
                status: 'pending',
                createdAt: new Date(),
                email: inviteEmail,
                isRead: false,
                isImportant: false,
            });
            inviteId = inviteDoc.id;
        }
        // 招待を通知ドキュメントに追加
        await addNotification({
            uid: invitedUid,
            type: type === 'project' ? 'project-invite' : 'team-invite',
            title: type === 'project' ? 'プロジェクト招待' : 'チーム招待',
            message: type === 'project' ? 'プロジェクト招待があります' : 'チーム招待があります',
            fromUid: invitedByUid,
            sourceId: inviteId,
            isRead: false,
            isImportant: false,
        })
        // メール送信用ドキュメント
        // await addDoc(collection(db, 'mail'), {
        //     to: [invitedEmailOrUserName],
        //     template: {
        //         name: 'プロジェクト招待メール',
        //         data: {
        //             projectName: 'プロジェクト招待',
        //             invitedByName: '招待者名',
        //             approvalUrl: '承認URL',
        //             rejectionUrl: '拒否URL',
        //         }
        //     }
        // })
        return true;
    } catch (error) {
        throw error;
    }
}
// 以前招待をされていたかどうか
async function isPreviouslyInvited(uid: string, projectId: string): Promise<boolean> {
    try {
        const projectInviteRef = collection(db, 'projectInvites');
        const q = query(projectInviteRef, where('invitedUid', '==', uid), where('projectId', '==', projectId));
        const snapshot = await getDocs(q);

        if(snapshot.empty) return false;

        return true;
    } catch (error) {
        throw error;
    }
}
// ユーザーが管理者かどうか
export async function isAdmin(uid: string, projectId: string) {
    try {
        const projectRef = doc(db, 'projects', projectId);
        const projectSnap = await getDoc(projectRef);
        if(!projectSnap.exists()) return false;
        if (projectSnap.data()['ownerId'] === uid) return true;
        return false;
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
        // projectMembersから削除対象を削除
        const projectMemberRef = collection(db, 'projectMembers');
        await deleteDoc(doc(projectMemberRef, deletedUid));

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
        const q = query(taskRef, 
            where('teamId', '==', teamId),
            where('parentTaskId', '==', null),
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