import { createContext, useContext, useState, useEffect } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        let userDoc = null;
        try {
          userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          // Sync Auth user to Firestore if doc missing (makes user searchable by others)
          if (!userDoc.exists()) {
            await setDoc(doc(db, 'users', firebaseUser.uid), {
              email: firebaseUser.email,
              displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
              createdAt: new Date().toISOString(),
            }, { merge: true });
          }
        } catch (err) {
          console.warn('Could not fetch/sync user profile (check Firestore rules):', err.message);
        }
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName || userDoc?.data()?.displayName || 'User',
          photoURL: firebaseUser.photoURL || userDoc?.data()?.photoURL,
        });
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const signUp = async (email, password, displayName) => {
    const { user: newUser } = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(newUser, { displayName });
    try {
      await setDoc(doc(db, 'users', newUser.uid), {
        email,
        displayName,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('Could not save user profile (check Firestore rules):', err.message);
    }
    return newUser;
  };

  const signIn = (email, password) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  const logout = () => signOut(auth);

  const value = { user, loading, signUp, signIn, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
