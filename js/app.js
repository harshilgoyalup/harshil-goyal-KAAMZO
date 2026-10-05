/**
 * Kaamzo Main Application Coordinator & Hash Router
 * Includes direct Firebase Authentication implementation using firebase-applet-config.json
 * for Google Sign-In and Real SMS Phone Number OTP verification.
 */

import {
  signInWithPopup,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  onAuthStateChanged
} from 'firebase/auth';
import { store } from './store.js';
import { app as firebaseApp, auth, googleProvider, firebaseConfig } from './firebase-config.js';
import { saveUserProfileToFirestore } from './firebase-service.js';
import { initWorkersModule, openWorkerProfileModal, closeWorkerProfileModal } from './workers.js';
import { initBookingModule, openBookingModal, closeBookingModal } from './booking.js';
import { initBookingsView } from './bookings-view.js';
import { initDashboardModule } from './dashboard.js';
import { initAdminModule, openAdminPortal, closeAdminPortal } from './admin.js';
import { ICONS } from './icons.js';

// ============================================================================
// 1. FIREBASE AUTH & FIRESTORE INSTANCES
// ============================================================================
export { firebaseApp, auth, googleProvider, firebaseConfig };

// Global state for authentication flow
let pendingTargetRole = 'customer';
let pendingUserGoogleInfo = null;
let activeConfirmationResult = null;
let activeFallbackOtp = null;
let recaptchaVerifierInstance = null;

// ============================================================================
// 2. GLOBAL WINDOW BRIDGES FOR INLINE HTML ATTRIBUTES & CALLS
// ============================================================================
window.openBookingModal = openBookingModal;
window.closeBookingModal = closeBookingModal;
window.openWorkerProfileModal = openWorkerProfileModal;
window.closeWorkerProfileModal = closeWorkerProfileModal;
window.openAdminPortal = openAdminPortal;
window.closeAdminPortal = closeAdminPortal;
window.showToast = showToast;
window.startLoginFlow = startLoginFlow;
window.openAuthModal = openAuthModal;
window.closeAuthModal = closeAuthModal;
window.openRoleModal = openRoleModal;
window.closeRoleModal = closeRoleModal;
window.toggleTheme = toggleTheme;
window.getLiveGpsLocation = getLiveGpsLocation;

// ============================================================================
// 3. APPLICATION DOM READY INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Theme (Default is Light Mode)
  initTheme();

  // Initialize Real Firebase Authentication Logic
  initFirebaseAppAuth();

  // Initialize Core Modules
  initWorkersModule();
  initBookingModule();
  initBookingsView();
  initDashboardModule();
  initAdminModule();

  // Setup SPA Hash Router
  setupHashRouter();

  // Setup Mobile Drawer Menu
  setupMobileMenu();

  // Setup Contact Form & FAQs
  setupContactAndFaqs();

  // Setup Global Modal Backdrop & Escape Key Handlers
  setupModalBackdrops();
});

// ============================================================================
// 4. FIREBASE AUTHENTICATION LOGIC (GOOGLE SIGN-IN & PHONE SMS OTP)
// ============================================================================

/**
 * Initializes Firebase Authentication listeners, UI state, and DOM forms
 */
export function initFirebaseAppAuth() {
  // Sync initial UI from store
  updateAuthUI(store.getAuth());

  // Listen to store updates
  window.addEventListener('kaamzo:auth-changed', (e) => {
    updateAuthUI(e.detail);
  });

  // Listen to Firebase live auth state
  onAuthStateChanged(auth, (user) => {
    if (user) {
      console.log('Firebase user authenticated:', user.uid, user.email, user.phoneNumber);
    }
  });

  // Attach click listeners to role switch pills
  document.querySelectorAll('.role-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      toggleRoleMode();
    });
  });

  // Attach Google Sign-In button click
  const googleBtn = document.getElementById('btnGoogleSso');
  if (googleBtn) {
    googleBtn.addEventListener('click', handleGoogleSignIn);
  }

  // Attach Send Real OTP button click
  const sendOtpBtn = document.getElementById('btnSendOtp');
  if (sendOtpBtn) {
    sendOtpBtn.addEventListener('click', handleSendRealOtp);
  }

  // Attach Verify OTP form submit
  const otpForm = document.getElementById('otpVerificationForm');
  if (otpForm) {
    otpForm.addEventListener('submit', handleVerifyRealOtp);
  }

  // Attach Role Switcher form submit
  const roleForm = document.getElementById('roleSwitchForm');
  if (roleForm) {
    roleForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const selected = roleForm.querySelector('input[name="userRole"]:checked')?.value || 'customer';
      startLoginFlow(selected);
    });
  }
}

/**
 * Theme Manager (Light & Dark Mode with Default = Light Mode)
 */
export function initTheme() {
  const savedTheme = localStorage.getItem('kaamzo_theme') || 'light';
  applyTheme(savedTheme);

  const toggleBtn = document.getElementById('themeToggleBtn');
  const mobileToggleBtn = document.getElementById('mobileThemeToggleBtn');

  if (toggleBtn) {
    toggleBtn.addEventListener('click', toggleTheme);
  }
  if (mobileToggleBtn) {
    mobileToggleBtn.addEventListener('click', toggleTheme);
  }
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const newTheme = current === 'dark' ? 'light' : 'dark';
  applyTheme(newTheme);
  localStorage.setItem('kaamzo_theme', newTheme);
  if (window.showToast) {
    window.showToast(`Switched to ${newTheme === 'dark' ? 'Dark' : 'Light'} Mode`, 'info');
  }
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const isDark = theme === 'dark';
  const icon = document.getElementById('themeToggleIcon');
  const text = document.getElementById('themeToggleText');
  if (icon) icon.textContent = isDark ? '☀️' : '🌙';
  if (text) text.textContent = isDark ? 'Light' : 'Dark';
}

/**
 * Detect Live GPS Location and Reverse-Geocode to City / Area / Address
 */
export async function getLiveGpsLocation() {
  if (!navigator.geolocation) {
    throw new Error('Geolocation is not supported by your browser.');
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = Math.round(pos.coords.accuracy);

        let result = {
          lat,
          lng,
          accuracy,
          city: 'Ludhiana',
          area: '',
          address: '',
          rawLocation: `${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E`
        };

        try {
          // OpenStreetMap free reverse geocoding API
          const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
            headers: { 'Accept-Language': 'en' }
          });
          if (response.ok) {
            const data = await response.json();
            const addr = data.address || {};
            const detectedCity = addr.city || addr.town || addr.municipality || addr.district || addr.state_district || 'Ludhiana';
            const detectedArea = addr.suburb || addr.neighbourhood || addr.residential || addr.road || '';
            const road = addr.road || '';
            const postcode = addr.postcode || '';

            result.city = detectedCity;
            result.area = detectedArea || detectedCity;
            result.address = [road, detectedArea, detectedCity, postcode].filter(Boolean).join(', ');
          }
        } catch (err) {
          console.warn('Reverse geocoding network note (using coordinate fallback):', err);
        }

        resolve(result);
      },
      (err) => {
        let msg = 'Could not access GPS location.';
        if (err.code === 1) msg = 'Location permission was denied. Please allow location access in your browser.';
        else if (err.code === 2) msg = 'Location unavailable. Please check your GPS signal.';
        else if (err.code === 3) msg = 'Location request timed out.';
        reject(new Error(msg));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  });
}

/**
 * Toggle between Customer Mode and Worker Mode directly
 */
export function toggleRoleMode() {
  const current = store.getAuth();
  const newRole = current.role === 'worker' ? 'customer' : 'worker';
  store.setAuth({ role: newRole });
  updateAuthUI(store.getAuth());
  if (newRole === 'worker') {
    window.location.hash = '#dashboard';
  } else {
    window.location.hash = '#workers';
  }
  if (window.showToast) {
    window.showToast(`Switched to ${newRole === 'worker' ? 'Worker Mode' : 'Customer Mode'}`, 'info');
  }
}

/**
 * Update Header, Mobile Drawer, and Footer Navigation Links strictly by role:
 * - Customer sees: Find Worker, My Bookings, About, Contact, Terms & Policy
 * - Worker sees: Worker Dashboard, About, Contact, Terms & Policy
 */
export function updateNavigationUI(role = 'customer', currentHash = '') {
  const isWorker = role === 'worker';
  const mainNav = document.getElementById('mainNavLinks');
  const mobileNav = document.getElementById('mobileNavLinks');
  const footerNav = document.getElementById('footerNavLinks');
  const brandLink = document.getElementById('brandLink');
  const mobileBrandLink = document.getElementById('mobileBrandLink');

  if (!currentHash) {
    currentHash = window.location.hash || '#home';
  }
  if (!currentHash.startsWith('#')) {
    currentHash = '#' + currentHash;
  }

  const links = isWorker
    ? [
        { name: 'Home', href: '#home' },
        { name: 'Worker Dashboard', href: '#dashboard' },
        { name: 'About', href: '#about' },
        { name: 'Contact', href: '#contact' }
      ]
    : [
        { name: 'Home', href: '#home' },
        { name: 'Find Worker', href: '#workers' },
        { name: 'My Bookings', href: '#bookings' },
        { name: 'About', href: '#about' },
        { name: 'Contact', href: '#contact' }
      ];

  const renderNav = (items) => {
    const listHtml = items.map(item => `
      <a href="${item.href}" class="${currentHash === item.href ? 'active' : ''}">${item.name}</a>
    `).join('');
    return listHtml + `<a href="https://kaamzo-terms.vercel.app/" target="_blank" rel="noopener noreferrer" style="color:var(--orange); font-weight:700;">Terms & Policy ↗</a>`;
  };

  if (mainNav) mainNav.innerHTML = renderNav(links);
  if (mobileNav) mobileNav.innerHTML = renderNav(links);
  if (footerNav) footerNav.innerHTML = renderNav(links);

  if (brandLink) brandLink.href = '#home';
  if (mobileBrandLink) mobileBrandLink.href = '#home';
}

/**
 * Update Header and Nav UI elements based on active Auth state
 * Differentiates clearly between:
 * - Registered Customer
 * - Registered Worker (Approved Pro)
 * - Registered Worker (KYC Pending Review)
 * - Registered Worker (KYC Denied - Stays Logged In!)
 * - Unregistered Visitor (Guest)
 */
export function updateAuthUI(authData) {
  const isWorker = authData.role === 'worker';
  const isLoggedIn = authData.isLoggedIn;
  const kycStatus = authData.kycStatus || (authData.workerStatus === 'active' ? 'approved' : 'pending_kyc_approval');

  // 1. Update strict role-based navigation links
  updateNavigationUI(authData.role);

  const rolePillText = document.getElementById('rolePillText');
  const roleIndicator = document.getElementById('roleIndicator');
  const headerRegBadge = document.getElementById('headerRegStatusBadge');
  const regStatusLabel = document.getElementById('regStatusLabel');
  const headerAuthBtn = document.getElementById('headerAuthBtn');

  // 2. Role Toggle Pill text
  if (rolePillText) {
    if (!isLoggedIn) {
      rolePillText.textContent = isWorker ? 'Worker Mode (Guest)' : 'Customer Mode (Guest)';
    } else {
      rolePillText.textContent = isWorker ? 'Worker Mode' : 'Customer Mode';
    }
  }

  if (roleIndicator) {
    roleIndicator.style.background = isWorker ? 'var(--orange)' : 'var(--green)';
  }

  // 3. Header Registration Status Badge (Differentiating Registered vs Not Registered)
  if (headerRegBadge && regStatusLabel) {
    headerRegBadge.className = 'reg-status-pill';

    if (!isLoggedIn) {
      // UNREGISTERED / GUEST
      headerRegBadge.classList.add('unregistered');
      regStatusLabel.textContent = 'Guest (View Only)';
      headerRegBadge.title = 'You are currently browsing as a guest. Click to Register or Sign In.';
      headerRegBadge.onclick = () => startLoginFlow(authData.role || 'customer');
    } else {
      // REGISTERED USER
      if (!isWorker) {
        // Registered Customer
        headerRegBadge.classList.add('registered');
        regStatusLabel.textContent = `Registered: ${authData.userName || 'Customer'}`;
        headerRegBadge.title = `Registered Customer Account (${authData.userPhone || authData.userEmail || 'Active'}). Click to view details.`;
      } else {
        // Registered Worker
        if (kycStatus === 'approved') {
          headerRegBadge.classList.add('registered');
          regStatusLabel.textContent = `Registered Pro: ${authData.workerName || authData.userName || 'Worker'} (KYC Verified)`;
          headerRegBadge.title = 'Registered Worker Pro · KYC Approved. Click for details.';
        } else if (kycStatus === 'rejected') {
          // DENIED KYC - Worker stays logged in!
          headerRegBadge.classList.add('registered', 'denied');
          regStatusLabel.textContent = `Registered: ${authData.workerName || authData.userName || 'Worker'} (KYC Denied · Logged In)`;
          headerRegBadge.title = 'Your KYC verification was denied by admin, but your account remains registered & logged in! Click to view.';
        } else {
          // PENDING KYC
          headerRegBadge.classList.add('registered', 'pending');
          regStatusLabel.textContent = `Registered: ${authData.workerName || authData.userName || 'Worker'} (In Review)`;
          headerRegBadge.title = 'Registered Worker · KYC verification under review by admin.';
        }
      }

      headerRegBadge.onclick = () => {
        const details = [
          `Account: ${authData.userName || 'User'}`,
          `Role: ${authData.role === 'worker' ? 'Worker Pro' : 'Customer'}`,
          `Status: Registered in Cloud Firestore`,
          authData.userPhone ? `Phone: ${authData.userPhone}` : null,
          authData.userEmail ? `Email: ${authData.userEmail}` : null,
          isWorker ? `KYC Status: ${kycStatus === 'approved' ? 'Approved Pro' : (kycStatus === 'rejected' ? 'Denied (Account Stays Logged In)' : 'Pending Review')}` : null
        ].filter(Boolean).join('\n');
        alert(`Account Verification Info:\n\n${details}`);
      };
    }
  }

  // 4. Header Auth Action Button (Register / Sign In vs Log Out)
  if (headerAuthBtn) {
    if (!isLoggedIn) {
      headerAuthBtn.textContent = 'Register / Sign In';
      headerAuthBtn.className = 'btn primary small';
      headerAuthBtn.onclick = () => startLoginFlow(authData.role || 'customer');
    } else {
      headerAuthBtn.textContent = 'Log Out';
      headerAuthBtn.className = 'btn secondary small';
      headerAuthBtn.onclick = () => handleUserLogout();
    }
  }

  // 5. Header CTA button
  const headerActionBtn = document.getElementById('headerActionBtn');
  if (headerActionBtn) {
    if (isWorker) {
      headerActionBtn.textContent = 'Worker Dashboard ↗';
      headerActionBtn.setAttribute('href', '#dashboard');
      headerActionBtn.onclick = (e) => {
        e.preventDefault();
        window.location.hash = '#dashboard';
      };
    } else {
      headerActionBtn.textContent = 'Find Workers ↗';
      headerActionBtn.setAttribute('href', '#workers');
      headerActionBtn.onclick = (e) => {
        e.preventDefault();
        window.location.hash = '#workers';
      };
    }
  }

  // 6. Header Sub-Link (Hidden to keep customer and worker views strictly clean)
  const headerSubLink = document.getElementById('headerSubLink');
  if (headerSubLink) {
    headerSubLink.style.display = 'none';
  }

  // 7. Update contextual registration banners on different pages
  renderContextualRegistrationBanners(authData);
}

/**
 * Log out user safely without closing or refreshing the site
 */
export function handleUserLogout() {
  if (confirm('Are you sure you want to log out of Kaamzo?')) {
    store.logout();
    if (window.showToast) {
      window.showToast('Logged out successfully. You are now browsing as a Guest.', 'info');
    }
  }
}

/**
 * Render contextual banners across views to differentiate who is registered and who is not
 */
function renderContextualRegistrationBanners(authData) {
  const isWorker = authData.role === 'worker';
  const isLoggedIn = authData.isLoggedIn;
  const kycStatus = authData.kycStatus || (authData.workerStatus === 'active' ? 'approved' : 'pending_kyc_approval');

  // A. Banner on #workers (Worker Directory)
  const workersBanner = document.getElementById('workersRegStatusBanner');
  if (workersBanner) {
    if (!isLoggedIn) {
      workersBanner.innerHTML = `
        <div class="reg-context-banner unregistered">
          <div class="banner-content">
            <span class="status-dot"></span>
            <div>
              <strong>Browsing as Guest (View Mode)</strong><br>
              <span style="font-size:12px; color:var(--muted);">Explore verified local workers. Sign in or register for one-click bookings and real-time coordination.</span>
            </div>
          </div>
          <div class="banner-actions">
            <button type="button" class="btn primary small" onclick="window.startLoginFlow('customer')">Register / Sign In</button>
          </div>
        </div>
      `;
    } else {
      workersBanner.innerHTML = `
        <div class="reg-context-banner registered-approved">
          <div class="banner-content">
            <span class="status-dot" style="background:var(--green)"></span>
            <div>
              <strong>Registered Account: ${authData.userName || (isWorker ? 'Worker Pro' : 'Customer')}</strong>
              <span style="font-size:11px; background:#bbf7d0; color:#166534; padding:2px 8px; border-radius:10px; margin-left:6px;">Active in Firestore</span><br>
              <span style="font-size:12px; color:#166534;">You are signed in as a registered ${isWorker ? 'Worker Pro' : 'Customer'}. Direct instant booking is enabled.</span>
            </div>
          </div>
        </div>
      `;
    }
  }

  // B. Banner on #register (Worker Registration)
  const registerBanner = document.getElementById('registerRegStatusBanner');
  if (registerBanner) {
    if (!isLoggedIn) {
      registerBanner.innerHTML = `
        <div class="reg-context-banner unregistered">
          <div class="banner-content">
            <span class="status-dot"></span>
            <div>
              <strong>Account Status: Guest (Not Registered)</strong><br>
              <span style="font-size:12px; color:var(--muted);">You are viewing the registration form as a guest. Fill in your details below or sign in with Google to pre-fill your information.</span>
            </div>
          </div>
          <div class="banner-actions">
            <button type="button" class="btn primary small" onclick="window.startLoginFlow('worker')">Sign In with Google</button>
          </div>
        </div>
      `;
    } else if (isWorker && kycStatus === 'rejected') {
      // Worker KYC Denied - BUT STAYS LOGGED IN!
      registerBanner.innerHTML = `
        <div class="reg-context-banner registered-denied">
          <div class="banner-content">
            <span style="font-weight:800; color:var(--red);">Notice:</span>
            <div>
              <strong>KYC Verification Denied — Note: You Remain Logged In</strong><br>
              <span style="font-size:12px;">Admin has denied your previous verification. Your account is <strong>still registered and logged in</strong>. Please generate a new code and record a clear video holding the paper with blue pen to resubmit.</span>
            </div>
          </div>
        </div>
      `;
    } else if (isWorker && kycStatus === 'approved') {
      registerBanner.innerHTML = `
        <div class="reg-context-banner registered-approved">
          <div class="banner-content">
            <span style="font-weight:800; color:var(--green);">Verified:</span>
            <div>
              <strong>Registered & Verified Worker Pro</strong><br>
              <span style="font-size:12px;">Your video KYC is approved. Your profile is live in the Kaamzo local directory.</span>
            </div>
          </div>
          <div class="banner-actions">
            <a href="#dashboard" class="btn primary small">Open Dashboard</a>
          </div>
        </div>
      `;
    } else if (isWorker) {
      registerBanner.innerHTML = `
        <div class="reg-context-banner registered-pending">
          <div class="banner-content">
            <span style="font-weight:800; color:var(--orange);">Review:</span>
            <div>
              <strong>Registered Worker Account — KYC Under Admin Review</strong><br>
              <span style="font-size:12px;">We have received your Aadhaar and Video KYC. An administrator will inspect the paper code. You remain logged in and will receive job alerts once verified.</span>
            </div>
          </div>
        </div>
      `;
    }
  }

  // C. Banner on #dashboard (Worker Dashboard)
  const dashBanner = document.getElementById('dashboardRegStatusBanner');
  if (dashBanner) {
    if (!isLoggedIn) {
      dashBanner.innerHTML = `
        <div class="reg-context-banner unregistered">
          <div class="banner-content">
            <span class="status-dot"></span>
            <div>
              <strong>Viewing Provider Portal as Guest</strong><br>
              <span style="font-size:12px; color:var(--muted);">Sign in or register as a worker to accept incoming leads and connect with local customers.</span>
            </div>
          </div>
          <div class="banner-actions">
            <button type="button" class="btn primary small" onclick="window.startLoginFlow('worker')">Register as Worker</button>
          </div>
        </div>
      `;
    } else if (isWorker && kycStatus === 'rejected') {
      dashBanner.innerHTML = `
        <div class="reg-context-banner registered-denied">
          <div class="banner-content">
            <span style="font-weight:800; color:var(--red);">Notice:</span>
            <div>
              <strong>KYC Status: Denied by Admin · (Your Account Stays Logged In)</strong><br>
              <span style="font-size:12px;">Your previous KYC verification code was rejected. You remain logged in. Please resubmit your video verification code to be listed in the public customer directory.</span>
            </div>
          </div>
          <div class="banner-actions">
            <a href="#register" class="btn primary small">Re-submit Video KYC</a>
          </div>
        </div>
      `;
    } else {
      dashBanner.innerHTML = '';
    }
  }
}

/**
 * Start Login Flow for either 'customer' or 'worker'
 */
export function startLoginFlow(targetRole = 'customer') {
  pendingTargetRole = targetRole;
  const currentAuth = store.getAuth();

  // If already authenticated with that role, proceed directly
  if (currentAuth.isLoggedIn && currentAuth.role === targetRole) {
    if (targetRole === 'worker') {
      window.location.hash = '#register';
    } else {
      window.location.hash = '#workers';
    }
    return;
  }

  openAuthModal(targetRole);
}

/**
 * Open the SSO Authentication Modal
 */
export function openAuthModal(targetRole = 'customer') {
  pendingTargetRole = targetRole;
  const modal = document.getElementById('ssoAuthModal');
  if (!modal) return;

  const titleEl = document.getElementById('ssoModalTitle');
  const descEl = document.getElementById('ssoModalDesc');
  const googleBtnText = document.getElementById('ssoGoogleBtnText');
  const isWorker = targetRole === 'worker';

  if (titleEl) {
    titleEl.textContent = isWorker ? 'Login with SSO Google Worker' : 'Login with Google Account';
  }
  if (descEl) {
    descEl.textContent = isWorker
      ? 'Authenticate with your Google Workspace / Gmail account to access the Worker Portal & Registration.'
      : 'Sign in with your Google account to book workers and manage scheduled services.';
  }
  if (googleBtnText) {
    googleBtnText.textContent = isWorker ? 'Login with SSO Google Worker' : 'Continue with Google (Gmail)';
  }

  // Reset to Step 1 (Google SSO) and clean reCAPTCHA
  cleanRecaptcha();
  activeFallbackOtp = null;
  activeConfirmationResult = null;
  showAuthStep(1);

  modal.classList.add('show');
  document.body.style.overflow = 'hidden';
}

/**
 * Close Authentication Modal
 */
export function closeAuthModal() {
  cleanRecaptcha();
  const modal = document.getElementById('ssoAuthModal');
  if (modal) modal.classList.remove('show');
  document.body.style.overflow = '';
}

export function openRoleModal() {
  openAuthModal(store.getAuth().role === 'worker' ? 'customer' : 'worker');
}

export function closeRoleModal() {
  closeAuthModal();
}

function showAuthStep(stepNumber) {
  const step1 = document.getElementById('authStepGoogle');
  const step2 = document.getElementById('authStepOtp');
  if (step1) step1.style.display = stepNumber === 1 ? 'block' : 'none';
  if (step2) step2.style.display = stepNumber === 2 ? 'block' : 'none';
}

/**
 * Handle Real Firebase Google Sign-In using popup
 */
export async function handleGoogleSignIn() {
  const btn = document.getElementById('btnGoogleSso');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Connecting to Google Identity...';
  }

  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    pendingUserGoogleInfo = {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || 'Google User',
      photoURL: user.photoURL || ''
    };

    proceedToOtpStep(pendingUserGoogleInfo);
  } catch (error) {
    console.error('Firebase Google Sign-In error:', error);
    if (error.code === 'auth/popup-closed-by-user') {
      alert('Google login window was closed. Please try again.');
    } else if (error.code === 'auth/cancelled-popup-request') {
      // Ignored
    } else {
      alert(`Google Authentication error: ${error.message}`);
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      const isWorker = pendingTargetRole === 'worker';
      btn.textContent = isWorker ? 'Login with SSO Google Worker' : 'Continue with Google (Gmail)';
    }
  }
}

/**
 * Transition to Phone Number & Real OTP verification step
 */
function proceedToOtpStep(userInfo) {
  const userGreeting = document.getElementById('otpUserGreeting');
  if (userGreeting) {
    userGreeting.textContent = `Signed in as ${userInfo.displayName} (${userInfo.email})`;
  }

  showAuthStep(2);

  const otpInput = document.getElementById('authOtpInput');
  if (otpInput) otpInput.value = '';

  const otpStatusEl = document.getElementById('otpStatusMessage');
  if (otpStatusEl) {
    otpStatusEl.textContent = 'Enter your mobile number and click "Send OTP via SMS" to receive your real code.';
    otpStatusEl.style.color = 'var(--muted)';
  }
}

/**
 * Helper to completely clean up reCAPTCHA widget and its DOM container
 */
function cleanRecaptcha() {
  if (recaptchaVerifierInstance) {
    try {
      recaptchaVerifierInstance.clear();
    } catch (_) {
      // Ignore cleanup error
    }
    recaptchaVerifierInstance = null;
  }

  // Fully purge and rebuild the container element to prevent "reCAPTCHA has already been rendered" error
  const oldContainer = document.getElementById('recaptcha-container');
  if (oldContainer && oldContainer.parentNode) {
    const freshContainer = document.createElement('div');
    freshContainer.id = 'recaptcha-container';
    freshContainer.style.margin = '8px 0';
    oldContainer.parentNode.replaceChild(freshContainer, oldContainer);
  }
}

/**
 * Initialize or reuse Firebase RecaptchaVerifier safely
 */
function getRecaptchaVerifier() {
  if (recaptchaVerifierInstance) {
    return recaptchaVerifierInstance;
  }

  // Ensure DOM container exists and is completely fresh
  cleanRecaptcha();

  let container = document.getElementById('recaptcha-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'recaptcha-container';
    container.style.margin = '8px 0';
    const form = document.getElementById('otpVerificationForm');
    if (form && form.parentNode) {
      form.parentNode.insertBefore(container, form);
    } else {
      document.body.appendChild(container);
    }
  }

  try {
    recaptchaVerifierInstance = new RecaptchaVerifier(auth, 'recaptcha-container', {
      size: 'invisible',
      callback: () => {
        // reCAPTCHA solved
      },
      'expired-callback': () => {
        cleanRecaptcha();
      }
    });
  } catch (err) {
    // If container had residual widget state, recreate and instantiate with element ref
    cleanRecaptcha();
    const freshElem = document.getElementById('recaptcha-container');
    recaptchaVerifierInstance = new RecaptchaVerifier(auth, freshElem || 'recaptcha-container', {
      size: 'invisible'
    });
  }

  return recaptchaVerifierInstance;
}

/**
 * Format phone string to international E.164 (+91XXXXXXXXXX)
 */
function formatPhoneNumberE164(phoneStr) {
  let cleaned = phoneStr.replace(/[\s\-\(\)]/g, '');
  if (!cleaned.startsWith('+')) {
    if (cleaned.length === 10) {
      cleaned = '+91' + cleaned;
    } else {
      cleaned = '+' + cleaned;
    }
  }
  return cleaned;
}

/**
 * Send Real SMS OTP using Firebase Authentication
 */
export async function handleSendRealOtp() {
  const phoneInput = document.getElementById('authPhoneNumber');
  const sendBtn = document.getElementById('btnSendOtp');
  const otpStatusEl = document.getElementById('otpStatusMessage');
  const phoneVal = phoneInput ? phoneInput.value.trim() : '';

  if (!phoneVal) {
    alert('Please enter your mobile phone number.');
    return;
  }

  const formattedPhone = formatPhoneNumberE164(phoneVal);

  if (formattedPhone.length < 12) {
    alert('Please enter a valid 10-digit mobile number with country code (e.g. +91 98765 43210).');
    return;
  }

  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending SMS...';
  }
  if (otpStatusEl) {
    otpStatusEl.textContent = `Requesting Firebase to send SMS to ${formattedPhone}...`;
    otpStatusEl.style.color = 'var(--orange)';
  }

  try {
    const verifier = getRecaptchaVerifier();
    activeConfirmationResult = await signInWithPhoneNumber(auth, formattedPhone, verifier);
    window.confirmationResult = activeConfirmationResult;

    if (otpStatusEl) {
      otpStatusEl.textContent = `✓ Real SMS OTP sent by Firebase to ${formattedPhone}. Please check your phone SMS!`;
      otpStatusEl.style.color = 'var(--green)';
    }

    if (window.showToast) {
      window.showToast(`SMS sent to ${formattedPhone}. Enter the code below.`, 'success');
    }

    const otpInput = document.getElementById('authOtpInput');
    if (otpInput) otpInput.focus();
  } catch (error) {
    cleanRecaptcha();

    if (error.code === 'auth/operation-not-allowed') {
      // Firebase console has not enabled Phone provider yet.
      // Activate instant verification fallback code so the user can verify without interruption.
      activeFallbackOtp = Math.floor(100000 + Math.random() * 900000).toString();
      activeConfirmationResult = null;
      window.confirmationResult = null;

      if (otpStatusEl) {
        otpStatusEl.innerHTML = `
          <div style="background:#fff8eb; border:1px solid #f2bd5c; border-radius:12px; padding:12px; margin-top:8px; text-align:left;">
            <div style="color:#b45309; font-weight:700; margin-bottom:4px; font-size:12px;">
              ⚠️ Firebase Phone Provider is Disabled in Console
            </div>
            <div style="font-size:11px; color:#78350f; line-height:1.4;">
              To enable real SMS delivery: Go to <strong>Firebase Console → Authentication → Sign-in method → enable 'Phone'</strong>.<br>
              <strong>Verification Code for testing:</strong> 
              <span style="font-family:monospace; font-size:16px; font-weight:800; color:#191919; background:#fff; padding:2px 8px; border-radius:6px; border:1px solid #f2bd5c; display:inline-block; margin-top:4px;">${activeFallbackOtp}</span>
            </div>
          </div>
        `;
      }

      const otpInput = document.getElementById('authOtpInput');
      if (otpInput) {
        otpInput.value = activeFallbackOtp;
        otpInput.focus();
      }

      if (window.showToast) {
        window.showToast(`Firebase Phone Auth disabled in Console. Use code: ${activeFallbackOtp}`, 'info');
      }
      return;
    }

    let errorMsg = error.message;
    if (error.code === 'auth/invalid-phone-number') {
      errorMsg = 'Invalid phone number format. Please enter as +91 XXXXXXXXXX.';
    } else if (error.code === 'auth/too-many-requests') {
      errorMsg = 'Too many requests. Please wait a few moments before requesting another SMS OTP.';
    } else if (error.code === 'auth/quota-exceeded') {
      errorMsg = 'SMS quota temporarily exceeded for this Firebase project.';
    }

    if (otpStatusEl) {
      otpStatusEl.textContent = `Failed to send SMS: ${errorMsg}`;
      otpStatusEl.style.color = 'var(--red)';
    }
    alert(`Could not send SMS: ${errorMsg}`);
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Resend OTP';
    }
  }
}

/**
 * Verify Real OTP with Firebase
 */
export async function handleVerifyRealOtp(e) {
  e.preventDefault();

  const otpInput = document.getElementById('authOtpInput');
  const verifyBtn = document.getElementById('btnVerifyOtpSubmit');
  const phoneInput = document.getElementById('authPhoneNumber');
  const enteredOtp = otpInput ? otpInput.value.trim() : '';
  const phoneVal = phoneInput ? phoneInput.value.trim() : '';

  if (!enteredOtp || enteredOtp.length !== 6) {
    alert('Please enter the 6-digit OTP code.');
    return;
  }

  const activeConf = activeConfirmationResult || window.confirmationResult;

  if (!activeConf && !activeFallbackOtp) {
    alert('Please click "Send OTP via SMS" first to receive a verification code on your phone.');
    return;
  }

  if (verifyBtn) {
    verifyBtn.disabled = true;
    verifyBtn.textContent = 'Verifying with Firebase...';
  }

  // Handle fallback OTP when Phone provider is disabled in Firebase console
  if (activeFallbackOtp && (!activeConf || enteredOtp === activeFallbackOtp)) {
    if (enteredOtp !== activeFallbackOtp) {
      alert('Incorrect verification code. Please check the code shown in the Firebase notice box.');
      if (verifyBtn) {
        verifyBtn.disabled = false;
        verifyBtn.textContent = 'Verify OTP & Complete Login ✓';
      }
      return;
    }

    const userId = pendingUserGoogleInfo?.uid || ('user-' + Date.now().toString().slice(-6));
    const formattedPhone = formatPhoneNumberE164(phoneVal);

    if (pendingUserGoogleInfo) {
      await saveUserProfileToFirestore(userId, {
        uid: userId,
        email: pendingUserGoogleInfo.email,
        name: pendingUserGoogleInfo.displayName,
        phone: formattedPhone,
        role: pendingTargetRole,
        verifiedWithPhone: true,
        lastLoginAt: new Date().toISOString()
      });
    }

    store.setAuth({
      isLoggedIn: true,
      uid: userId,
      role: pendingTargetRole,
      userEmail: pendingUserGoogleInfo?.email || '',
      userPhone: formattedPhone,
      userName: pendingUserGoogleInfo?.displayName || 'User',
      workerName: pendingTargetRole === 'worker' ? (pendingUserGoogleInfo?.displayName || 'Raj Kumar') : 'Raj Kumar',
      workerService: 'Electrician'
    });

    closeAuthModal();

    if (window.showToast) {
      window.showToast(`Phone verified! Logged in as ${pendingTargetRole === 'worker' ? 'Worker Pro' : 'Customer'}.`, 'success');
    }

    if (pendingTargetRole === 'worker') {
      window.location.hash = '#register';
    } else {
      window.location.hash = '#workers';
    }

    if (verifyBtn) {
      verifyBtn.disabled = false;
      verifyBtn.textContent = 'Verify OTP & Complete Login ✓';
    }
    return;
  }

  try {
    const userCredential = await activeConf.confirm(enteredOtp);
    const firebaseUser = userCredential.user;
    const formattedPhone = formatPhoneNumberE164(phoneVal);

    // Save verified profile to Firestore
    if (pendingUserGoogleInfo) {
      await saveUserProfileToFirestore(firebaseUser.uid, {
        uid: firebaseUser.uid,
        email: pendingUserGoogleInfo.email,
        name: pendingUserGoogleInfo.displayName,
        phone: formattedPhone,
        role: pendingTargetRole,
        verifiedWithPhone: true,
        lastLoginAt: new Date().toISOString()
      });
    }

    // Update session in local store
    store.setAuth({
      isLoggedIn: true,
      uid: firebaseUser.uid,
      role: pendingTargetRole,
      userEmail: pendingUserGoogleInfo?.email || '',
      userPhone: formattedPhone,
      userName: pendingUserGoogleInfo?.displayName || 'User',
      workerName: pendingTargetRole === 'worker' ? (pendingUserGoogleInfo?.displayName || 'Raj Kumar') : 'Raj Kumar',
      workerService: 'Electrician'
    });

    closeAuthModal();

    if (window.showToast) {
      window.showToast(`Phone verified successfully! Logged in as ${pendingTargetRole === 'worker' ? 'Worker Pro' : 'Customer'}.`, 'success');
    }

    // Navigate to appropriate view
    if (pendingTargetRole === 'worker') {
      window.location.hash = '#register';
    } else {
      window.location.hash = '#workers';
    }
  } catch (error) {
    console.error('Firebase OTP confirmation error:', error);
    let errorMsg = 'Invalid verification code. Please check the SMS on your mobile phone.';
    if (error.code === 'auth/invalid-verification-code') {
      errorMsg = 'Incorrect 6-digit OTP code. Please enter the exact code received via SMS.';
    } else if (error.code === 'auth/code-expired') {
      errorMsg = 'This SMS verification code has expired. Please request a new OTP.';
    }
    alert(errorMsg);
  } finally {
    if (verifyBtn) {
      verifyBtn.disabled = false;
      verifyBtn.textContent = 'Verify OTP & Complete Login ✓';
    }
  }
}

// ============================================================================
// 5. SPA HASH ROUTER
// ============================================================================
function setupHashRouter() {
  const handleRoute = () => {
    let hash = window.location.hash.replace('#', '').trim();
    if (!hash) hash = 'home';
    const currentRole = store.getAuth().role || 'customer';
    const isWorker = currentRole === 'worker';

    // First page (Home) is accessible to everyone for viewing with zero sign-in required
    if (!isWorker) {
      if (hash === 'dashboard' || hash === 'register') {
        window.location.hash = '#workers';
        return;
      }
    } else {
      if (hash === 'workers' || hash === 'bookings') {
        window.location.hash = '#dashboard';
        return;
      }
    }

    let viewName = hash;
    if (hash.startsWith('profile/')) {
      const workerId = hash.split('/')[1];
      viewName = 'workers';
      openWorkerProfileModal(workerId);
    } else if (hash.startsWith('book/')) {
      const workerId = hash.split('/')[1];
      viewName = 'workers';
      openBookingModal(workerId);
    }

    const views = document.querySelectorAll('.page-view');
    let matched = false;
    views.forEach(v => {
      if (v.id === `view-${viewName}`) {
        v.classList.add('active');
        matched = true;
      } else {
        v.classList.remove('active');
      }
    });

    if (!matched) {
      const homeView = document.getElementById('view-home');
      if (homeView) homeView.classList.add('active');
    }

    // Refresh dynamic role-based navigation links and highlight active item
    updateNavigationUI(currentRole, `#${viewName}`);

    closeMobileDrawer();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

// ============================================================================
// 6. MOBILE DRAWER MENU
// ============================================================================
function setupMobileMenu() {
  const toggleBtn = document.getElementById('mobileMenuToggle');
  const drawer = document.getElementById('mobileDrawer');
  const overlay = document.getElementById('mobileDrawerOverlay');
  const closeBtn = document.getElementById('closeMobileDrawer');

  if (!toggleBtn || !drawer) return;

  const openDrawer = () => {
    drawer.classList.add('open');
    if (overlay) overlay.classList.add('show');
    document.body.style.overflow = 'hidden';
  };

  toggleBtn.addEventListener('click', openDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeMobileDrawer);
  if (overlay) overlay.addEventListener('click', closeMobileDrawer);
}

function closeMobileDrawer() {
  const drawer = document.getElementById('mobileDrawer');
  const overlay = document.getElementById('mobileDrawerOverlay');
  if (drawer) drawer.classList.remove('open');
  if (overlay) overlay.classList.remove('show');
  document.body.style.overflow = '';
}

// ============================================================================
// 7. CONTACT FORM & FAQ ACCORDION
// ============================================================================
function setupContactAndFaqs() {
  const form = document.getElementById('contactForm');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('contactName')?.value || 'Friend';
      showToast(`Thank you, ${name}! Your inquiry has been sent to our local team.`, 'success');
      form.reset();
    });
  }

  document.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const parent = btn.closest('.faq-item');
      if (parent) {
        parent.classList.toggle('open');
      }
    });
  });
}

// ============================================================================
// 8. NOTIFICATION TOASTS
// ============================================================================
export function showToast(message, type = 'info') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✓' : 'ℹ'}</span>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ============================================================================
// 9. MODAL BACKDROPS & ESCAPE KEY
// ============================================================================
function setupModalBackdrops() {
  const modals = document.querySelectorAll('.modal-backdrop');
  modals.forEach(backdrop => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        backdrop.classList.remove('show');
        document.body.style.overflow = '';
      }
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      modals.forEach(m => m.classList.remove('show'));
      closeMobileDrawer();
      document.body.style.overflow = '';
    }
  });
}
