import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBBvWADcQ0KMC_RETAienal9OzcXNdAB5Y",
  authDomain: "clipshare-a400e.firebaseapp.com",
  databaseURL: "https://clipshare-a400e-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "clipshare-a400e",
  storageBucket: "clipshare-a400e.firebasestorage.app",
  messagingSenderId: "877784089653",
  appId: "1:877784089653:web:0eae375795a6bf476b1d7c"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const storage = getStorage(app);