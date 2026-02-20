import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { auth } from '../services/firebaseClient';
import { subscribeCurrentUser } from '../services/backend';
import { useAuth } from '../context/AuthContext';

const UserContext = createContext({
  authUser: null,
  appUser: null,
  loading: true,
});

export function UserProvider({ children }) {
  const { user } = useAuth();
  const [appUser, setAppUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setAppUser(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = subscribeCurrentUser(user.uid, (doc) => {
      setAppUser(doc ? { ...doc, uid: doc.$id } : null);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user?.uid]);

  const value = useMemo(
    () => ({
      authUser: user ? auth.currentUser : null,
      appUser,
      loading,
    }),
    [user, appUser, loading]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUserContext() {
  return useContext(UserContext);
}
