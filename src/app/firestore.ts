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
import { Project, AddProjectInput, ProjectInvite } from "./types/project";
import { Notification, AddNotificationInput } from "./types/notification";
import { AddTeamInput, AddTeamMemberInput, Team, TeamMember } from "./types/team";

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
export async function inviteToProject(
    projectId: string,
    invitedEmailOrUserName: string,
    myEmail: string,
    invitedByUid: string, // 招待したユーザー
) {
    try {
        // 招待されるユーザーのメールアドレスが存在しない場合は招待しない
        const invitedUserRef = collection(db, 'users');
        const q = query(invitedUserRef, where('email', '==', invitedEmailOrUserName));
        const snapshot = await getDocs(q);
        if (snapshot.empty) return false;
        const invitedUid = snapshot.docs[0].id;
        if(!invitedUid) return false;
        // 自分のメールアドレスの場合falseを返す
        if(invitedEmailOrUserName === myEmail) return false;
        // 招待したユーザーが管理者でない場合は招待しない
        const projectRef = doc(db, 'projects', projectId);
        const projectSnap = await getDoc(projectRef);
        if(!projectSnap.exists()) return false;
        const projectData = projectSnap.data() as Project;
        if(projectData.ownerId !== invitedByUid) return false;
        // 以前招待をされていたかどうか
        const isPreviouslyInvitedResult: boolean = await isPreviouslyInvited(invitedUid, projectId);
        let projectInviteId: string | null = null;
        if(isPreviouslyInvitedResult) {
            // 招待の承認待ちの場合、招待をやめる
            const projectInviteRef = collection(db, 'projectInvites');
            const q = query(projectInviteRef, where('invitedUid', '==', invitedUid), where('projectId', '==', projectId));
            const snapshot = await getDocs(q);
            if(snapshot.empty) return false;
            projectInviteId = snapshot.docs[0].id;
            if(!projectInviteId) return false;
            if(snapshot.docs[0].data()['status'] === 'pending') return false;
            // projectInviteの招待情報を変更
            await updateDoc(doc(db, 'projectInvites', projectInviteId), {
                status: 'pending',
            });
        } else {
            // projectInvitesに招待情報を追加
            const projectInviteDoc = await addDoc(collection(db, 'projectInvites'), {
                projectId: projectId,
                invitedUid: invitedUid,
                invitedByUid: invitedByUid,
                status: 'pending',
                email: invitedEmailOrUserName,
                createdAt: new Date(),
            });
            projectInviteId = projectInviteDoc.id;
        }
        // 招待を通知ドキュメントに追加
        await addNotification({
            uid: invitedUid,
            type: 'project-invite',
            title: 'プロジェクト招待',
            message: 'プロジェクト招待があります',
            fromUid: invitedByUid,
            sourceId: projectInviteId,
            isRead: false,
            isImportant: false,
        })
        // メール送信用ドキュメント
        await addDoc(collection(db, 'mail'), {
            to: [invitedEmailOrUserName],
            template: {
                name: 'プロジェクト招待メール',
                data: {
                    projectName: 'プロジェクト招待',
                    invitedByName: '招待者名',
                    approvalUrl: '承認URL',
                    rejectionUrl: '拒否URL',
                }
            }
        })
        console.log("メール送信成功");
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
export async function acceptProjectInvite(inviteId: string, userId: string) {
    try {
        const projectInviteRef = doc(db, 'projectInvites', inviteId);
        // projectInviteのデータを更新する
        await updateDoc(projectInviteRef, {
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
        const projectInviteRef = doc(db, 'projectInvites', projectInviteId);
        const projectInviteSnap = await getDoc(projectInviteRef);
        if(!projectInviteSnap.exists()) return null;
        const projectInviteData = projectInviteSnap.data() as ProjectInvite;
        return projectInviteData.projectId;
    } catch (error) {
        throw error;
    }
}

// projectInviteの招待を拒否する
export async function declineProjectInvite(projectInviteId: string) {
    try {
        const projectInviteRef = doc(db, 'projectInvites', projectInviteId);
        await updateDoc(projectInviteRef, {
            status: 'declined',
        });
    } catch (error) {
        throw new Error('招待の拒否に失敗しました');
    }
}

// projectInviteの招待状況を取得
export async function getProjectInviteStatus(projectInviteId: string) {
    try {
        const projectInviteRef = doc(db, 'projectInvites', projectInviteId);
        const projectInviteSnap = await getDoc(projectInviteRef);
        if(!projectInviteSnap.exists()) return null;
        const projectInviteData = projectInviteSnap.data() as ProjectInvite;
        return projectInviteData.status;
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
        const teamDoc = await addDoc(collection(db, 'team'), {
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
        const teamRef = doc(db, 'team', teamId);
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