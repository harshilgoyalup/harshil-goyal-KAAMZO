/**
 * Kaamzo Platform Customer Booking System
 * Handles multi-step booking modal, confirmation summary, booking ID generation, and storage.
 */

import { store } from './store.js';
import { getCategoryIconSvg } from './icons.js';

let bookingDraft = {
  workerId: '',
  workerName: '',
  workerService: '',
  workerAvatar: '',
  amount: 500,
  customerName: '',
  customerPhone: '',
  city: 'Ludhiana',
  location: '',
  date: '',
  timeSlot: 'Morning (9:00 AM - 12:00 PM)',
  jobDescription: ''
};

export function initBookingModule() {
  const modal = document.getElementById('bookingModal');
  if (!modal) return;

  // Form submission
  const bookingForm = document.getElementById('customerBookingForm');
  if (bookingForm) {
    bookingForm.addEventListener('submit', handleProceedToConfirm);
  }

  const confirmBtn = document.getElementById('finalizeBookingBtn');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', handleFinalizeBooking);
  }

  const backToFormBtn = document.getElementById('bookingBackToEditBtn');
  if (backToFormBtn) {
    backToFormBtn.addEventListener('click', () => {
      showBookingStep(1);
    });
  }

  // Live GPS Auto-fill in booking modal
  const btnBookDetectGps = document.getElementById('btnBookDetectGps');
  if (btnBookDetectGps) {
    btnBookDetectGps.addEventListener('click', async () => {
      const statusEl = document.getElementById('bookGpsStatus');
      const cityInput = document.getElementById('bookCity');
      const addrInput = document.getElementById('bookAddress');

      btnBookDetectGps.disabled = true;
      btnBookDetectGps.innerHTML = '<span>🛰️</span> Locating...';
      if (statusEl) {
        statusEl.innerHTML = '<span style="font-size:11px; color:var(--orange);">Fetching live GPS coordinates...</span>';
      }

      try {
        if (typeof window.getLiveGpsLocation === 'function') {
          const loc = await window.getLiveGpsLocation();
          if (loc.city && cityInput) cityInput.value = loc.city;
          if (addrInput) addrInput.value = loc.address || loc.formatted || `${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)}`;
          if (statusEl) {
            statusEl.innerHTML = `<span style="font-size:11px; color:var(--green); font-weight:700;">✓ Live GPS found: ${loc.city} (${loc.lat.toFixed(3)}°, ${loc.lon.toFixed(3)}°)</span>`;
          }
          if (window.showToast) window.showToast(`GPS location detected: ${loc.city}`, 'success');
        } else {
          throw new Error('Geolocation service not initialized');
        }
      } catch (err) {
        console.error('GPS auto-fill error in booking:', err);
        if (statusEl) {
          statusEl.innerHTML = `<span style="font-size:11px; color:var(--red);">⚠️ ${err.message || 'Could not fetch GPS location'}</span>`;
        }
      } finally {
        btnBookDetectGps.disabled = false;
        btnBookDetectGps.innerHTML = '<span>🛰️</span> Auto-Fill GPS Address';
      }
    });
  }

  // Pre-fill user profile if customer is logged in
  const auth = store.getAuth();
  if (auth.customerName) {
    const nameInput = document.getElementById('bookCustomerName');
    if (nameInput && !nameInput.value) nameInput.value = auth.customerName;
  }
  if (auth.customerPhone) {
    const phoneInput = document.getElementById('bookCustomerPhone');
    if (phoneInput && !phoneInput.value) phoneInput.value = auth.customerPhone;
  }
}

/**
 * Open Booking Modal for a specific worker or general service
 */
export function openBookingModal(workerIdOrCategory = '') {
  const modal = document.getElementById('bookingModal');
  if (!modal) return;

  const workers = store.getWorkers();
  let worker = null;

  if (workerIdOrCategory && workerIdOrCategory.startsWith('w-')) {
    worker = workers.find(w => w.id === workerIdOrCategory);
  } else if (workerIdOrCategory) {
    // If a service string was passed
    worker = workers.find(w => w.service.toLowerCase().includes(workerIdOrCategory.toLowerCase()));
  }

  if (!worker) {
    if (workers && workers.length > 0) {
      worker = workers[0];
    } else {
      if (window.showToast) {
        window.showToast('No registered workers in directory yet. Be the first to register as a local pro!', 'info');
      } else {
        alert('No registered workers in directory yet. Be the first to register as a local pro!');
      }
      return;
    }
  }

  // Populate worker selector
  const select = document.getElementById('bookWorkerSelect');
  if (select) {
    select.innerHTML = workers.map(w => `
      <option value="${w.id}" ${w.id === worker.id ? 'selected' : ''}>
        ${w.name} (${w.service} - ₹${w.rate}/day) · ${w.city}
      </option>
    `).join('');

    select.onchange = (e) => {
      const selected = workers.find(w => w.id === e.target.value);
      if (selected) {
        updateBookingWorkerUI(selected);
      }
    };
  }

  updateBookingWorkerUI(worker);

  // Set default date to Tomorrow
  const dateInput = document.getElementById('bookDate');
  if (dateInput && !dateInput.value) {
    const tmrw = new Date();
    tmrw.setDate(tmrw.getDate() + 1);
    dateInput.value = tmrw.toISOString().split('T')[0];
  }

  showBookingStep(1);

  modal.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function updateBookingWorkerUI(worker) {
  bookingDraft.workerId = worker.id;
  bookingDraft.workerName = worker.name;
  bookingDraft.workerService = worker.service;
  bookingDraft.workerAvatar = '';
  bookingDraft.amount = worker.rate;
  bookingDraft.city = worker.city;

  const badge = document.getElementById('bookWorkerPreviewBadge');
  if (badge) {
    badge.innerHTML = `
      <div style="display:flex; align-items:center; gap:12px;">
        <div style="width:40px; height:40px; border-radius:12px; background:var(--orange-pale); display:grid; place-items:center; color:var(--orange);">
          ${getCategoryIconSvg(worker.service)}
        </div>
        <div>
          <b style="font-size:14px; display:block;">${worker.name}</b>
          <span style="font-size:12px; color:var(--muted);">${worker.service} · ${worker.city}</span>
        </div>
      </div>
      <div style="text-align:right;">
        <strong style="font-size:16px; color:var(--ink);">₹${worker.rate}</strong>
        <small style="display:block; font-size:10px; color:#888;">PER DAY</small>
      </div>
    `;
  }
}

export function closeBookingModal() {
  const modal = document.getElementById('bookingModal');
  if (modal) modal.classList.remove('show');
  document.body.style.overflow = '';
}

function showBookingStep(step) {
  document.getElementById('bookingStep1').style.display = step === 1 ? 'block' : 'none';
  document.getElementById('bookingStep2').style.display = step === 2 ? 'block' : 'none';
  document.getElementById('bookingStep3').style.display = step === 3 ? 'block' : 'none';
}

/**
 * Handle proceed to Step 2 (Confirmation Review Screen)
 */
function handleProceedToConfirm(e) {
  e.preventDefault();

  const name = document.getElementById('bookCustomerName').value.trim();
  const phone = document.getElementById('bookCustomerPhone').value.trim();
  const city = document.getElementById('bookCity').value.trim();
  const address = document.getElementById('bookAddress').value.trim();
  const dateVal = document.getElementById('bookDate').value;
  const timeSlot = document.getElementById('bookTimeSlot').value;
  const desc = document.getElementById('bookDescription').value.trim();

  if (!name || !phone || !address || !dateVal) {
    alert('Please fill out all required fields.');
    return;
  }

  // Format readable date
  const dateObj = new Date(dateVal);
  const formattedDate = dateObj.toLocaleDateString('en-IN', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  bookingDraft.customerName = name;
  bookingDraft.customerPhone = phone;
  bookingDraft.city = city || bookingDraft.city;
  bookingDraft.location = `${address}, ${city}`;
  bookingDraft.date = formattedDate;
  bookingDraft.timeSlot = timeSlot;
  bookingDraft.jobDescription = desc || 'General maintenance and repairs';

  // Render Step 2 Review UI
  document.getElementById('confirmWorkerName').textContent = bookingDraft.workerName;
  document.getElementById('confirmService').textContent = bookingDraft.workerService;
  document.getElementById('confirmLocation').textContent = bookingDraft.location;
  document.getElementById('confirmDate').textContent = bookingDraft.date;
  document.getElementById('confirmTime').textContent = bookingDraft.timeSlot;
  document.getElementById('confirmTotalAmount').textContent = `₹${bookingDraft.amount}`;

  showBookingStep(2);
}

/**
 * Handle final booking creation and storage
 */
async function handleFinalizeBooking() {
  const confirmBtn = document.getElementById('finalizeBookingBtn');
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Confirming Booking...';
  }

  try {
    const newBooking = await store.addBooking(bookingDraft);

    // Show Step 3 (Success)
    const idEl = document.getElementById('confirmedBookingIdText');
    const workerEl = document.getElementById('confirmedWorkerNameText');
    const schedEl = document.getElementById('confirmedScheduleText');

    if (idEl) idEl.textContent = `#${newBooking.id}`;
    if (workerEl) workerEl.textContent = newBooking.workerName;
    if (schedEl) schedEl.textContent = `${newBooking.date} · ${newBooking.timeSlot}`;

    showBookingStep(3);

    if (window.showToast) {
      window.showToast(`Booking ${newBooking.id} confirmed!`, 'success');
    }
  } catch (err) {
    console.error('Failed to save booking:', err);
    alert('Could not complete booking. Please try again.');
  } finally {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Confirm & Send Request ✓';
    }
  }
}
