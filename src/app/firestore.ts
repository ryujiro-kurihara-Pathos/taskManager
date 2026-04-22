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
} from "firebase/firestore";
import { db } from "./firebase";
import { AddTaskInput, Task } from "./types/task";
import { Project, AddProjectInput } from "./types/project";

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
export async function addTask(
    uid: string,
    data: AddTaskInput
) {
    try {
        if(data.startDate && data.dueDate && new Date(data.startDate) > new Date(data.dueDate)) return null;
       const docRef = await addDoc(collection(db, 'tasks'), {
            ...data,
            createdAt: new Date(),
        } as AddTaskInput);
        const task = {
            id: uid,
            ...data,
            createdAt: new Date().toISOString(),
        } as Task;
        return task;
    } catch (error) {
        return null;
    }
}
// メインタスクを取得
export async function getMainTasks() {
    try {
        // メインタスクのクエリを作成
        const q = query(
            collection(db, 'tasks'),
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
export async function updateTask(inputTask: AddTaskInput, taskId: string) {
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
        const docRef = await addDoc(collection(db, 'projects'), {
            name: input.name,
            ownerId: input.ownerId,
            memberIds: input.memberIds,
            visibility: input.visibility,
            isArchived: input.isArchived,
            description: input.description,
            createdAt: new Date().toISOString(),
        });
        const project = {
            id: docRef.id,
            ...input,
            createdAt: new Date().toISOString(),
        } as Project;

        return project;
    } catch (error) {
        return null;
    }
}

// プロジェクトを取得
export async function getProjects() {
    try {
        const q = query(collection(db, 'projects'));
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