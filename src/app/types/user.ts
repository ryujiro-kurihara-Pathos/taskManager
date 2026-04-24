export type User = {
    id: string;
    email: string;
    userName: string;
    photoURL: string | null;
    createdAt: string;
    // updatedAt: string;
}

export type AddUserInput = Omit<User, 'id' | 'createdAt'>;