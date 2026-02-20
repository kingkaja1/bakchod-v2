import { useState } from 'react';
import { useAuth } from './context/AuthContext';
import Login from './components/Login';
import SignUp from './components/SignUp';
import Layout from './components/Layout';
import { UserProvider } from './contexts/UserContext';
import MainApp from './MainApp';
import './App.css';

function App() {
  const { user, loading } = useAuth();
  const [showSignUp, setShowSignUp] = useState(false);

  if (loading) {
    return (
      <div className="app loading">
        <div className="loading-spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <Layout>
        {showSignUp ? (
          <SignUp onToggle={() => setShowSignUp(false)} />
        ) : (
          <Login onToggle={() => setShowSignUp(true)} />
        )}
      </Layout>
    );
  }

  return (
    <UserProvider>
      <MainApp />
    </UserProvider>
  );
}

export default App;
