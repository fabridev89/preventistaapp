// app/_layout.tsx
import { Slot, usePathname, useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { initLocalDatabase } from '../src/config/database';
import { auth, db } from '../src/config/firebase.config';
import { useAutoSync } from '../src/hooks/useAutoSync';
import { useAuthStore } from '../src/store/useAuthStore';

export default function RootLayout() {
  const { businessId, setAuth } = useAuthStore();
  const pathname = usePathname();
  const router = useRouter();
  
  // EL FRENO: Evita que el router se dispare antes de tiempo
  const [isReady, setIsReady] = useState(false); 

  // PRENDEMOS EL MOTOR SILENCIOSO AQUÍ
  useAutoSync();

  useEffect(() => {
    initLocalDatabase();
  
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      // Si hay un usuario logueado, vamos a buscar su "llave mágica" a la base de datos
      if (currentUser && currentUser.email) {
        try {
          const q = query(collection(db, 'users'), where('email', '==', currentUser.email.toLowerCase()));
          const querySnapshot = await getDocs(q);
          
          if (!querySnapshot.empty) {
            const userData = querySnapshot.docs[0].data();
            // Guardamos el ID de la distribuidora en el estado global
            setAuth(userData.businessId, userData.name || 'Vendedor');
          }
        } catch (error) {
          console.error("Error recuperando la sesión:", error);
        }
      }
      
      // Ya revisamos Firebase, liberamos el freno
      setIsReady(true); 
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isReady) return; 

    // Forma más limpia y a prueba de TypeScript para saber si estamos en el Login
    const inLoginScreen = pathname === '/';

    if (!businessId && !inLoginScreen) {
      router.replace('/');
    } else if (businessId && inLoginScreen) {
      router.replace('/(tabs)/pedidos'); 
    }
  }, [businessId, isReady, pathname]); // <-- Actualizamos las dependencias

  return <Slot />;
}