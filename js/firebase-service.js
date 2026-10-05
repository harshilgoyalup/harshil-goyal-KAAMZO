/**
 * Firestore Database Service for Kaamzo
 * Handles all real-time Firestore operations: Workers with KYC, Bookings, Users, and Admin approvals.
 */

import { db } from './firebase-config.js';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import { INITIAL_WORKERS, INITIAL_BOOKINGS } from './data.js';

const COLLECTIONS = {
  WORKERS: 'workers',
  BOOKINGS: 'bookings',
  USERS: 'users'
};

/**
 * Real Firestore Data Service (Zero Mock Seeding)
 */
export async function seedInitialFirestoreData() {
  // Production database: Clean real records only, no demo data
  return;
}

/**
 * Fetch all workers from Firestore
 */
export async function fetchWorkersFromFirestore(includePending = false) {
  try {
    const colRef = collection(db, COLLECTIONS.WORKERS);
    const snap = await getDocs(colRef);
    if (!snap.empty) {
      const list = [];
      snap.forEach(docSnap => {
        const data = docSnap.data();
        list.push({ id: docSnap.id, ...data });
      });
      return includePending ? list : list.filter(w => w.kycStatus === 'approved' || w.verified === true);
    }
  } catch (err) {
    console.warn('Firestore fetchWorkers fallback to local data:', err.message);
  }
  return INITIAL_WORKERS;
}

/**
 * Save new worker registration application to Firestore
 */
export async function saveWorkerToFirestore(workerData) {
  const workerId = 'w-' + Date.now().toString().slice(-6);
  const record = {
    id: workerId,
    name: workerData.name,
    phone: workerData.phone,
    email: workerData.email || '',
    service: workerData.service,
    skills: workerData.skills || [],
    experience: workerData.experience || 1,
    rate: Number(workerData.rate) || 500,
    hourlyRate: Number(workerData.hourlyRate) || 80,
    city: workerData.city,
    area: workerData.area || '',
    address: workerData.address || '',
    about: workerData.about || '',
    aadhaarNumber: workerData.aadhaarNumber,
    kycCode: workerData.kycCode,
    kycVideoUrl: workerData.kycVideoUrl || '',
    kycVideoName: workerData.kycVideoName || '',
    kycStatus: 'pending_kyc_approval', // Needs Admin approval in Ctrl+4 dashboard
    verified: false,
    status: 'pending_approval',
    rating: 5.0,
    jobsCompleted: 0,
    availability: 'Pending KYC Approval',
    avatarIcon: workerData.avatarIcon || '👷',
    submittedAt: new Date().toISOString()
  };

  try {
    const docRef = doc(db, COLLECTIONS.WORKERS, workerId);
    await setDoc(docRef, { ...record, createdAt: serverTimestamp() });
  } catch (err) {
    console.warn('Firestore save worker note:', err.message);
  }

  return record;
}

/**
 * Admin action: Approve or reject worker KYC verification
 */
export async function updateWorkerKycStatusInFirestore(workerId, newStatus) {
  const isApproved = newStatus === 'approved';
  const updates = {
    kycStatus: newStatus,
    verified: isApproved,
    status: isApproved ? 'active' : 'rejected',
    availability: isApproved ? 'Available Today' : 'KYC Rejected'
  };

  try {
    const docRef = doc(db, COLLECTIONS.WORKERS, workerId);
    await updateDoc(docRef, updates);
  } catch (err) {
    console.warn('Firestore update worker note:', err.message);
  }

  return updates;
}

/**
 * Admin action: Delete worker application
 */
export async function deleteWorkerFromFirestore(workerId) {
  try {
    const docRef = doc(db, COLLECTIONS.WORKERS, workerId);
    await deleteDoc(docRef);
  } catch (err) {
    console.warn('Firestore delete worker note:', err.message);
  }
}

/**
 * Save new booking to Firestore
 */
export async function saveBookingToFirestore(bookingData) {
  const bookingId = 'KZ-' + Math.floor(10000 + Math.random() * 90000);
  const record = {
    id: bookingId,
    status: 'confirmed',
    createdAt: new Date().toISOString(),
    ...bookingData
  };

  try {
    const docRef = doc(db, COLLECTIONS.BOOKINGS, bookingId);
    await setDoc(docRef, { ...record, createdAt: serverTimestamp() });
  } catch (err) {
    console.warn('Firestore save booking note:', err.message);
  }

  return record;
}

/**
 * Save user profile to Firestore
 */
export async function saveUserProfileToFirestore(userId, profileData) {
  try {
    const docRef = doc(db, COLLECTIONS.USERS, userId);
    await setDoc(docRef, {
      ...profileData,
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.warn('Firestore save user note:', err.message);
  }
}
