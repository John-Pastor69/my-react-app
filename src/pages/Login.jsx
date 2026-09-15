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
    <div className="login-container">
      <div className="login-card">
        {/*header-section*/}
        <div className="header-container">

        </div>
      </div>
      <button 
        onClick={handleMicrosoftLogin}
      >
        Sign in with Microsoft
      </button>
    </div>
  );
}