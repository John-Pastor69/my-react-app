// src/pages/Login.jsx
import { signInWithPopup } from 'firebase/auth';
import { auth, microsoftProvider } from '../Firebase';

export default function Login() {
  
  const handleMicrosoftLogin = async () => {
    try {
      // Triggers the Microsoft login window
      const result = await signInWithPopup(auth, microsoftProvider);
      const user = result.user;
      
      console.log("Successfully logged in as:", user.displayName);
      console.log("User email:", user.email);
      
      // Here you can redirect the user to the main reservation dashboard 
      // or save their profile data to Firestore
      
    } catch (error) {
      console.error("Error signing in with Microsoft:", error.message);
    }
  };

  return (
    <div style={{ textAlign: 'center', marginTop: '50px' }}>
      <h2>Sign In to Continue</h2>
      <button 
        onClick={handleMicrosoftLogin}
        style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}
      >
        Sign in with Microsoft
      </button>
    </div>
  );
}