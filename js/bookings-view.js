/**
 * Kaamzo Platform Customer Bookings View
 * Renders upcoming, pending, completed, and cancelled bookings with full interactive actions.
 */

import { store } from './store.js';
import { ICONS } from './icons.js';

let activeTab = 'all';

export function initBookingsView() {
  setupTabs();
  renderBookings();

  window.addEventListener('kaamzo:bookings-updated', () => {
    renderBookings();
  });
}

function setupTabs() {
  const tabs = document.querySelectorAll('.bookings-tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeTab = tab.dataset.tab;
      renderBookings();
    });
  });
}

export function renderBookings() {
  const container = document.getElementById('bookingsListContainer');
  if (!container) return;

  const allBookings = store.getBookings();

  // Update tab counts
  const counts = {
    all: allBookings.length,
    upcoming: allBookings.filter(b => b.status === 'confirmed').length,
    pending: allBookings.filter(b => b.status === 'pending').length,
    completed: allBookings.filter(b => b.status === 'completed').length,
    cancelled: allBookings.filter(b => b.status === 'cancelled').length
  };

  const countAll = document.getElementById('countAllBookings');
  const countUpcoming = document.getElementById('countUpcomingBookings');
  const countPending = document.getElementById('countPendingBookings');
  const countCompleted = document.getElementById('countCompletedBookings');
  const countCancelled = document.getElementById('countCancelledBookings');

  if (countAll) countAll.textContent = counts.all;
  if (countUpcoming) countUpcoming.textContent = counts.upcoming;
  if (countPending) countPending.textContent = counts.pending;
  if (countCompleted) countCompleted.textContent = counts.completed;
  if (countCancelled) countCancelled.textContent = counts.cancelled;

  // Filter by active tab
  let filtered = allBookings;
  if (activeTab === 'upcoming') {
    filtered = allBookings.filter(b => b.status === 'confirmed');
  } else if (activeTab === 'pending') {
    filtered = allBookings.filter(b => b.status === 'pending');
  } else if (activeTab === 'completed') {
    filtered = allBookings.filter(b => b.status === 'completed');
  } else if (activeTab === 'cancelled') {
    filtered = allBookings.filter(b => b.status === 'cancelled');
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${ICONS.calendar}</div>
        <h3>No ${activeTab === 'all' ? '' : activeTab} bookings found</h3>
        <p>Looking for a skilled worker for repairs, construction, or cleaning?</p>
        <button class="btn primary small" onclick="window.location.hash='#workers'">Find & Hire Workers</button>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(b => `
    <article class="booking-card" data-id="${b.id}">
      <div class="booking-card-head">
        <div>
          <span class="booking-id-tag">#${b.id}</span>
          <h3 style="font: 800 18px Manrope; margin-top: 8px;">
            ${b.workerName}
            <span style="font-size: 13px; font-weight: 600; color: var(--muted); margin-left: 6px;">
              (${b.workerService})
            </span>
          </h3>
        </div>
        <span class="status-badge ${b.status}">${b.status}</span>
      </div>

      <div class="booking-details-grid">
        <div class="booking-detail-item">
          <small>Scheduled Date</small>
          <strong>${b.date}</strong>
        </div>
        <div class="booking-detail-item">
          <small>Time Slot</small>
          <strong>${b.timeSlot}</strong>
        </div>
        <div class="booking-detail-item">
          <small>Location</small>
          <strong title="${b.location}">${b.city || 'Local Site'}</strong>
        </div>
        <div class="booking-detail-item">
          <small>Estimated Pay</small>
          <strong style="color: var(--ink);">₹${b.amount}</strong>
        </div>
      </div>

      ${b.jobDescription ? `
        <div style="font-size: 13px; color: #6b6459; background: var(--paper); padding: 10px 14px; border-radius: 10px; border: 1px dashed #e8dfcf;">
          <strong style="font-size: 11px; text-transform: uppercase; color: #8c857b;">Job Description:</strong>
          <span style="margin-left: 6px;">${b.jobDescription}</span>
        </div>
      ` : ''}

      <div class="booking-actions">
        ${b.status === 'confirmed' ? `
          <button class="btn secondary small call-worker-btn" data-phone="${b.customerPhone || '+91 98765 43210'}">
            📞 Contact Worker
          </button>
          <button class="btn primary small complete-booking-btn" data-id="${b.id}">
            ✓ Mark Completed
          </button>
          <button class="btn danger small cancel-booking-btn" data-id="${b.id}">
            Cancel
          </button>
        ` : ''}

        ${b.status === 'pending' ? `
          <button class="btn danger small cancel-booking-btn" data-id="${b.id}">
            Cancel Request
          </button>
        ` : ''}

        ${b.status === 'completed' ? `
          <span style="font-size: 12px; color: var(--green); font-weight: 700; align-self: center; margin-right: 8px;">
            ✓ Payment of ₹${b.amount} settled directly
          </span>
          <button class="btn secondary small book-again-btn" data-worker-id="${b.workerId}">
            Book Again ↗
          </button>
        ` : ''}

        ${b.status === 'cancelled' ? `
          <button class="btn secondary small book-again-btn" data-worker-id="${b.workerId}">
            Re-book Worker
          </button>
        ` : ''}
      </div>
    </article>
  `).join('');

  // Attach actions
  container.querySelectorAll('.complete-booking-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      store.updateBookingStatus(btn.dataset.id, 'completed');
      if (window.showToast) window.showToast(`Booking #${btn.dataset.id} marked completed!`, 'success');
    });
  });

  container.querySelectorAll('.cancel-booking-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Are you sure you want to cancel this booking?')) {
        store.updateBookingStatus(btn.dataset.id, 'cancelled');
        if (window.showToast) window.showToast(`Booking #${btn.dataset.id} cancelled`, 'info');
      }
    });
  });

  container.querySelectorAll('.call-worker-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (window.showToast) {
        window.showToast(`Worker contact: ${btn.dataset.phone} (Calling connected)`, 'info');
      }
    });
  });

  container.querySelectorAll('.book-again-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (window.openBookingModal) {
        window.openBookingModal(btn.dataset.workerId);
      }
    });
  });
}
