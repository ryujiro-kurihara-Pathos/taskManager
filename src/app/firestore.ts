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
    arrayRemove,
    arrayUnion,
} from "firebase/firestore";
import { db } from "./firebase";
import { AddTaskInput, Task } from "./types/task";
import { Project, AddProjectInput } from "./types/project";
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
        const taskDoc = await addDoc(collection(db, 'tasks'), {
            ...addTaskInput,
            createdAt: createdAt,
        });
        const task = {
            id: taskDoc.id,
            ...addTaskInput,
            createdAt: createdAt.toISOString(),
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
        const taskRef = doc(db, 'tasks', taskId);

        await updateDoc(taskRef, inputTask);
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

// プロジェクト
// プロジェクトの追加
export async function addProject(input: AddProjectInput) {
    try {
        const createdAt = new Date();
        const docRef = await addDoc(collection(db, 'projects'), {
            name: input.name,
            ownerId: input.ownerId,
            memberIds: input.memberIds,
            visibility: input.visibility,
            isArchived: input.isArchived,
            description: input.description,
            createdAt: createdAt,
        });
        const project = {
            id: docRef.id,
            ...input,
            createdAt: createdAt.toISOString(),
        } as Project;

        return project;
    } catch (error) {
        return null;
    }
}
// プロジェクトを取得
export async function getProjects(uid: string) {
    try {
        const projectRef = collection(db, 'projects');
        const q = query(projectRef, where('memberIds', 'array-contains', uid));
        const snapshot = await getDocs(q);
        const projects: Project[] = [];
        
        snapshot.forEach((doc) => {
            const data = doc.data() as Project;

            projects.push({
                id: doc.id,
                name: data.name,
                ownerId: data.ownerId,
                memberIds: data.memberIds,
                visibility: data.visibility,
                isArchived: data.isArchived,
                description: data.description,
                createdAt: data.createdAt,
                teamIds: data.teamIds,
            });
        });

        return projects;
    } catch (error) {
        return [];
    }
}
// ドキュメントIDからプロジェクトを取得
export async function getProject(projectId: string) {
    try {
        const docRef = doc(db, 'projects', projectId);
        const docSnap = await getDoc(docRef);
        if(!docSnap.exists()) return null;

        const data = docSnap.data() as Project;
        return {
            id: docSnap.id,
            name: data.name,
            ownerId: data.ownerId,
            memberIds: data.memberIds,
            visibility: data.visibility,
            isArchived: data.isArchived,
            description: data.description,
            createdAt: data.createdAt,
        } as Project;

    } catch (error) {
        return null;
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
    invitedEmailOrUserName: string,
    myEmail: string,
    invitedByUid: string, // 招待したユーザー
) {
    try {
        // メールアドレスが一致するユーザーが存在しない場合は招待しない
        const invitedUserRef = collection(db, 'users');
        const q = query(invitedUserRef, where('email', '==', invitedEmailOrUserName));
        const snapshot = await getDocs(q);
        if(snapshot.empty) return false;
        const invitedUid = snapshot.docs[0].id;
        if(!invitedUid) return false;

        // 自分のメールアドレスの場合falseを返す
        if(invitedEmailOrUserName === myEmail) return false;

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
                email: invitedEmailOrUserName,
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
// プロジェクトメンバーの脱退
export async function leaveProject(projectId: string, uid: string) {
    try {
        const projectInviteRef = collection(db, 'projectInvites');
        const q = query(
            projectInviteRef,
            where('projectId', '==', projectId),
            where('invitedUid', '==', uid)
        );
        const snapshot = await getDocs(q);
        if(snapshot.empty) return;
        const projectInviteId = snapshot.docs[0].id;
        await updateDoc(doc(projectInviteRef, projectInviteId), {
            status: 'left',
        });
        
        const projectRef = doc(db, 'projects', projectId);
        await updateDoc(projectRef, {
            memberIds: arrayRemove(uid),
        });
        
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
// メンバーを削除
export async function deleteMember(deletedUid: string, projectId: string) {
    try {
        // projectInvitesのstatusをleftにする
        const projectInviteRef = collection(db, 'projectInvites');
        const q = query(projectInviteRef, where('invitedUid', '==', deletedUid), where('projectId', '==', projectId));
        const snapshot = await getDocs(q);
        if(snapshot.empty) return;
        const projectInviteId = snapshot.docs[0].id;
        await updateDoc(doc(projectInviteRef, projectInviteId), {
            status: 'left',
        });

        // projectsのmemberIdsからuidを削除
        await updateDoc(doc(db, 'projects', projectId), {
            memberIds: arrayRemove(deletedUid),
        });
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
// 承認したユーザーをプロジェクトメンバーに加える
export async function addProjectMember(projectId: string, userId: string) {
    try {
        const projectRef = doc(db, 'projects', projectId);
        await updateDoc(projectRef, {
            memberIds: arrayUnion(userId),
        });
    } catch (error) {
        throw new Error('プロジェクトメンバーの追加に失敗しました');
    }
}
// projectInviteIdからprojectIdを取得
export async function getProjectIdFromProjectInviteId(projectInviteId: string) {
    try {
        const projectInviteRef = doc(db, 'invites', projectInviteId);
        const projectInviteSnap = await getDoc(projectInviteRef);
        if(!projectInviteSnap.exists()) return null;
        const projectInviteData = projectInviteSnap.data() as Invite;
        return projectInviteData.targetId;
    } catch (error) {
        throw error;
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
// projectInviteの招待状況を取得
export async function getProjectInviteStatus(inviteId: string) {
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
        // チームをドキュメントに追加
        const createdAt = new Date();
        const teamDoc = await addDoc(collection(db, 'teams'), {
            ...addTeamInput,
            createdAt: new Date(),
        });
        // チームドキュメントのデータを取得
        const team = {
            id: teamDoc.id,
            ...addTeamInput,
            createdAt: createdAt.toISOString(),
        } as Team;
        return team;
    } catch (error) {
        throw error;
    }
}
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
export async function getTeamMembersByUserId(uid: string) {
    try {
        const teamMemberRef = collection(db, 'teamMembers');
        const q = query(teamMemberRef, where('userId', '==', uid));
        const snapshot = await getDocs(q);
        const teamMemberIds: string[] = [];
        snapshot.forEach((doc) => {
            teamMemberIds.push(doc.data()['teamId']);
        });
        return teamMemberIds;
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