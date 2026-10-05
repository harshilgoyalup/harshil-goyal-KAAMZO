/**
 * Kaamzo Platform Store & Storage Manager
 * Integrated with Firebase Cloud Firestore and LocalStorage fallback.
 */

import { INITIAL_WORKERS, INITIAL_BOOKINGS, INITIAL_INCOMING_REQUESTS } from './data.js';
import {
  seedInitialFirestoreData,
  fetchWorkersFromFirestore,
  saveWorkerToFirestore,
  updateWorkerKycStatusInFirestore,
  deleteWorkerFromFirestore,
  saveBookingToFirestore
} from './firebase-service.js';

const STORAGE_KEYS = {
  WORKERS: 'kaamzo_workers_clean_prod',
  BOOKINGS: 'kaamzo_bookings_clean_prod',
  AUTH: 'kaamzo_auth_clean_prod',
  WORKER_REQUESTS: 'kaamzo_requests_clean_prod',
  WORKER_METRICS: 'kaamzo_metrics_clean_prod'
};

class KaamzoStore {
  constructor() {
    this.cleanLegacyDemoStorage();
    this.initStore();
  }

  cleanLegacyDemoStorage() {
    try {
      localStorage.removeItem('kaamzo_workers_v2');
      localStorage.removeItem('kaamzo_bookings_v2');
      localStorage.removeItem('kaamzo_worker_requests_v2');
      localStorage.removeItem('kaamzo_worker_metrics_v2');
      localStorage.removeItem('kaamzo_workers');
      localStorage.removeItem('kaamzo_bookings');
    } catch (_) {}
  }

  async initStore() {
    // Zero demo data in production
    if (!localStorage.getItem(STORAGE_KEYS.WORKERS)) {
      localStorage.setItem(STORAGE_KEYS.WORKERS, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.BOOKINGS)) {
      localStorage.setItem(STORAGE_KEYS.BOOKINGS, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.WORKER_REQUESTS)) {
      localStorage.setItem(STORAGE_KEYS.WORKER_REQUESTS, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.WORKER_METRICS)) {
      localStorage.setItem(STORAGE_KEYS.WORKER_METRICS, JSON.stringify({
        todayJobs: 0,
        pendingRequests: 0,
        completedJobs: 0,
        totalEarnings: 0,
        isAvailable: true
      }));
    }
    if (!localStorage.getItem(STORAGE_KEYS.AUTH)) {
      localStorage.setItem(STORAGE_KEYS.AUTH, JSON.stringify({
        isLoggedIn: false,
        role: 'customer',
        userEmail: '',
        userPhone: '',
        userName: 'Guest Customer',
        workerId: '',
        workerName: '',
        workerService: ''
      }));
    }

    // Fetch real registered workers from Firestore
    try {
      const remoteWorkers = await fetchWorkersFromFirestore(true);
      if (remoteWorkers && remoteWorkers.length > 0) {
        localStorage.setItem(STORAGE_KEYS.WORKERS, JSON.stringify(remoteWorkers));
        window.dispatchEvent(new CustomEvent('kaamzo:workers-updated'));
      }
    } catch (e) {
      console.warn('Store sync note:', e);
    }
  }

  // ==========================================
  // AUTH & ROLE METHODS
  // ==========================================
  getAuth() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.AUTH);
      return data ? JSON.parse(data) : { isLoggedIn: false, role: 'customer' };
    } catch (e) {
      return { isLoggedIn: false, role: 'customer' };
    }
  }

  setAuth(data) {
    const current = this.getAuth();
    const updated = { ...current, ...data };
    localStorage.setItem(STORAGE_KEYS.AUTH, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('kaamzo:auth-changed', { detail: updated }));
    return updated;
  }

  logout() {
    const updated = {
      isLoggedIn: false,
      role: 'customer',
      userEmail: '',
      userPhone: '',
      userName: 'Guest'
    };
    localStorage.setItem(STORAGE_KEYS.AUTH, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('kaamzo:auth-changed', { detail: updated }));
    return updated;
  }

  // ==========================================
  // WORKERS METHODS
  // ==========================================
  getWorkers(includeAll = false) {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.WORKERS);
      const list = data ? JSON.parse(data) : INITIAL_WORKERS;
      // Filter for customer view: only show approved KYC or initial verified workers
      if (!includeAll) {
        return list.filter(w => w.kycStatus === 'approved' || (w.verified && w.kycStatus !== 'rejected'));
      }
      return list;
    } catch (e) {
      return INITIAL_WORKERS;
    }
  }

  getAllWorkersForAdmin() {
    return this.getWorkers(true);
  }

  getWorkerById(id) {
    const list = this.getWorkers(true);
    return list.find(w => w.id === id) || null;
  }

  async addWorkerWithKyc(workerData) {
    // 1. Save to Firestore
    const record = await saveWorkerToFirestore(workerData);

    // 2. Save to local storage
    const workers = this.getWorkers(true);
    workers.unshift(record);
    localStorage.setItem(STORAGE_KEYS.WORKERS, JSON.stringify(workers));

    window.dispatchEvent(new CustomEvent('kaamzo:workers-updated', { detail: record }));
    return record;
  }

  async approveWorkerKyc(workerId) {
    await updateWorkerKycStatusInFirestore(workerId, 'approved');
    const workers = this.getWorkers(true);
    const idx = workers.findIndex(w => w.id === workerId);
    if (idx !== -1) {
      workers[idx].kycStatus = 'approved';
      workers[idx].verified = true;
      workers[idx].status = 'active';
      workers[idx].availability = 'Available Today';
      localStorage.setItem(STORAGE_KEYS.WORKERS, JSON.stringify(workers));
      window.dispatchEvent(new CustomEvent('kaamzo:workers-updated'));
    }

    // Sync session state while maintaining active login
    const currentAuth = this.getAuth();
    if (currentAuth.isLoggedIn && (currentAuth.workerId === workerId || currentAuth.uid === workerId)) {
      this.setAuth({
        isLoggedIn: true,
        kycStatus: 'approved',
        workerStatus: 'active'
      });
    }
    return true;
  }

  async rejectWorkerKyc(workerId) {
    await updateWorkerKycStatusInFirestore(workerId, 'rejected');
    const workers = this.getWorkers(true);
    const idx = workers.findIndex(w => w.id === workerId);
    if (idx !== -1) {
      workers[idx].kycStatus = 'rejected';
      workers[idx].verified = false;
      workers[idx].status = 'rejected';
      workers[idx].availability = 'KYC Denied';
      localStorage.setItem(STORAGE_KEYS.WORKERS, JSON.stringify(workers));
      window.dispatchEvent(new CustomEvent('kaamzo:workers-updated'));
    }

    // CRITICAL: Denying KYC means the worker STAYS LOGGED IN!
    // The account remains registered and active in Firebase; only the verification status requires update.
    const currentAuth = this.getAuth();
    if (currentAuth.isLoggedIn && (currentAuth.workerId === workerId || currentAuth.uid === workerId)) {
      this.setAuth({
        isLoggedIn: true, // STAY LOGGED IN!
        kycStatus: 'rejected',
        workerStatus: 'rejected'
      });
    }
    return true;
  }

  async deleteWorker(workerId) {
    await deleteWorkerFromFirestore(workerId);
    let workers = this.getWorkers(true);
    workers = workers.filter(w => w.id !== workerId);
    localStorage.setItem(STORAGE_KEYS.WORKERS, JSON.stringify(workers));
    window.dispatchEvent(new CustomEvent('kaamzo:workers-updated'));
  }

  getIconForCategory(cat) {
    switch (cat) {
      case 'Electrician': return '⚡';
      case 'Plumber': return '🔧';
      case 'Mason / Construction': return '🧱';
      case 'Cleaning': return '🧹';
      case 'Painter': return '🎨';
      case 'Loading / Moving': return '📦';
      case 'Gardening': return '🌿';
      case 'Carpenter': return '🪚';
      default: return '👷';
    }
  }

  // ==========================================
  // BOOKINGS METHODS
  // ==========================================
  getBookings() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.BOOKINGS);
      return data ? JSON.parse(data) : INITIAL_BOOKINGS;
    } catch (e) {
      return INITIAL_BOOKINGS;
    }
  }

  async addBooking(bookingData) {
    const newBooking = await saveBookingToFirestore(bookingData);
    const bookings = this.getBookings();
    bookings.unshift(newBooking);
    localStorage.setItem(STORAGE_KEYS.BOOKINGS, JSON.stringify(bookings));

    this.updateWorkerMetrics({
      pendingRequests: this.getWorkerMetrics().pendingRequests + 1
    });

    window.dispatchEvent(new CustomEvent('kaamzo:bookings-updated', { detail: newBooking }));
    return newBooking;
  }

  updateBookingStatus(id, newStatus) {
    const bookings = this.getBookings();
    const idx = bookings.findIndex(b => b.id === id);
    if (idx !== -1) {
      bookings[idx].status = newStatus;
      localStorage.setItem(STORAGE_KEYS.BOOKINGS, JSON.stringify(bookings));
      window.dispatchEvent(new CustomEvent('kaamzo:bookings-updated', { detail: bookings[idx] }));
      return bookings[idx];
    }
    return null;
  }

  // ==========================================
  // WORKER DASHBOARD METRICS & REQUESTS
  // ==========================================
  getWorkerMetrics() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.WORKER_METRICS);
      return data ? JSON.parse(data) : {
        todayJobs: 3,
        pendingRequests: 2,
        completedJobs: 18,
        totalEarnings: 8450,
        isAvailable: true
      };
    } catch (e) {
      return { todayJobs: 3, pendingRequests: 2, completedJobs: 18, totalEarnings: 8450, isAvailable: true };
    }
  }

  updateWorkerMetrics(updates) {
    const current = this.getWorkerMetrics();
    const merged = { ...current, ...updates };
    localStorage.setItem(STORAGE_KEYS.WORKER_METRICS, JSON.stringify(merged));
    window.dispatchEvent(new CustomEvent('kaamzo:metrics-updated', { detail: merged }));
    return merged;
  }

  getIncomingRequests() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.WORKER_REQUESTS);
      return data ? JSON.parse(data) : INITIAL_INCOMING_REQUESTS;
    } catch (e) {
      return INITIAL_INCOMING_REQUESTS;
    }
  }

  removeIncomingRequest(reqId) {
    const list = this.getIncomingRequests().filter(r => r.id !== reqId);
    localStorage.setItem(STORAGE_KEYS.WORKER_REQUESTS, JSON.stringify(list));
    return list;
  }

  acceptRequest(reqId) {
    const requests = this.getIncomingRequests();
    const req = requests.find(r => r.id === reqId);
    if (!req) return;

    this.removeIncomingRequest(reqId);
    const metrics = this.getWorkerMetrics();
    this.updateWorkerMetrics({
      todayJobs: metrics.todayJobs + 1,
      pendingRequests: Math.max(0, metrics.pendingRequests - 1),
      totalEarnings: metrics.totalEarnings + 500
    });

    this.addBooking({
      workerId: 'w-101',
      workerName: 'Raj Kumar',
      workerService: 'Electrician',
      workerAvatar: '⚡',
      customerName: req.customerName,
      customerPhone: req.phone,
      date: req.date,
      timeSlot: 'Scheduled Job',
      location: req.location,
      city: 'Ludhiana',
      jobDescription: req.description,
      amount: 500,
      status: 'confirmed'
    });
  }

  declineRequest(reqId) {
    this.removeIncomingRequest(reqId);
    const metrics = this.getWorkerMetrics();
    this.updateWorkerMetrics({
      pendingRequests: Math.max(0, metrics.pendingRequests - 1)
    });
  }
}

export const store = new KaamzoStore();
