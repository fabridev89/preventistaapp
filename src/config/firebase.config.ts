// src/config/firebase.config.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from 'firebase/app';
import { Auth, getAuth, initializeAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: "AIzaSyBaBMEQJOxDzj3m_z7BezevctkZxuuZAvY",
  authDomain: "preventiastas.firebaseapp.com",
  projectId: "preventiastas",
  storageBucket: "preventiastas.firebasestorage.app",
  messagingSenderId: "123542788563",
  appId: "1:123542788563:web:5f17f83c61c5e6611c7726",
  measurementId: "G-88PZ6MFXGE"
};

const app = initializeApp(firebaseConfig);

let auth: Auth;

if (Platform.OS === 'web') {
  auth = getAuth(app);
} else {
  // @ts-ignore: Engañamos a TypeScript para que no marque error en el require dinámico
  const { getReactNativePersistence } = require('firebase/auth');
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
}

const db = getFirestore(app);

export { app, auth, db };

