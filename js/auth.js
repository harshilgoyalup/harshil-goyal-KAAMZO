/**
 * Kaamzo Platform Authentication Bridge
 * Re-exports Firebase Authentication implementation from app.js
 */

export {
  auth,
  googleProvider,
  initFirebaseAppAuth as initAuth,
  updateAuthUI,
  startLoginFlow,
  openAuthModal,
  closeAuthModal,
  openRoleModal,
  closeRoleModal,
  handleGoogleSignIn,
  handleSendRealOtp,
  handleVerifyRealOtp
} from './app.js';
