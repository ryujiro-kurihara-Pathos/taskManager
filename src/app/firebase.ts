
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, useDeviceLanguage } from "firebase/auth";

// 接続するプロジェクト情報
const firebaseConfig = {
  apiKey: "AIzaSyCfqh3fQGaPOMC_CzH6po3osmnYjylLYR4",
  authDomain: "kensyu10143.firebaseapp.com",
  projectId: "kensyu10143",
  storageBucket: "kensyu10143.firebasestorage.app",
  messagingSenderId: "145416194664",
  appId: "1:145416194664:web:26b0f7e2e4dfed99c749dd",
  measurementId: "G-87Z8Z4DFXH"
};

// Firebaseの初期化
const app = initializeApp(firebaseConfig);

// Firestore, Authenticationの初期化
export const db = getFirestore(app);
export const auth = getAuth(app);

// 確認メール等の言語をブラウザに合わせる（日本語環境では日本語テンプレートになりやすい）
useDeviceLanguage(auth);