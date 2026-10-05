/**
 * Kaamzo Platform Worker Dashboard
 * Provides worker statistics, live availability toggling, incoming job requests (accept/decline), and earnings tracking.
 */

import { store } from './store.js';

export function initDashboardModule() {
  renderDashboard();

  window.addEventListener('kaamzo:metrics-updated', () => {
    renderMetrics();
  });

  window.addEventListener('kaamzo:auth-changed', () => {
    renderDashboard();
  });

  // Availability toggle
  const toggle = document.getElementById('dashAvailabilityToggle');
  if (toggle) {
    toggle.addEventListener('change', (e) => {
      const isAvailable = e.target.checked;
      store.updateWorkerMetrics({ isAvailable });
      const statusLabel = document.getElementById('dashStatusLabel');
      if (statusLabel) {
        statusLabel.textContent = isAvailable ? 'Available for Work' : 'Busy / On Job';
        statusLabel.style.color = isAvailable ? 'var(--green)' : '#d97706';
      }
      if (window.showToast) {
        window.showToast(isAvailable ? 'Availability set to Available' : 'Availability set to Busy', 'info');
      }
    });
  }
}

export function renderDashboard() {
  const auth = store.getAuth();
  const metrics = store.getWorkerMetrics();

  // Profile Header
  const nameEl = document.getElementById('dashWorkerName');
  const tradeEl = document.getElementById('dashWorkerTrade');
  const cityEl = document.getElementById('dashWorkerCity');
  const toggle = document.getElementById('dashAvailabilityToggle');
  const statusLabel = document.getElementById('dashStatusLabel');

  if (nameEl) nameEl.textContent = auth.workerName || auth.userName || 'Registered Pro';
  if (tradeEl) tradeEl.textContent = auth.workerService ? `${auth.workerService} · Professional` : 'Trade Service';
  if (cityEl) cityEl.textContent = auth.city ? `📍 ${auth.city}` : '📍 Service Area';

  if (toggle) {
    toggle.checked = metrics.isAvailable !== false;
  }
  if (statusLabel) {
    const isAvail = metrics.isAvailable !== false;
    statusLabel.textContent = isAvail ? 'Available for Work' : 'Busy / On Job';
    statusLabel.style.color = isAvail ? 'var(--green)' : '#d97706';
  }

  renderMetrics();
  renderIncomingRequests();
  renderWorkerJobs();
}

function renderMetrics() {
  const metrics = store.getWorkerMetrics();

  const todayEl = document.getElementById('metricTodayJobs');
  const pendingEl = document.getElementById('metricPendingRequests');
  const completedEl = document.getElementById('metricCompletedJobs');
  const earningsEl = document.getElementById('metricEarnings');

  if (todayEl) todayEl.textContent = metrics.todayJobs || 0;
  if (pendingEl) pendingEl.textContent = metrics.pendingRequests || 0;
  if (completedEl) completedEl.textContent = metrics.completedJobs || 0;
  if (earningsEl) earningsEl.textContent = `₹${(metrics.totalEarnings || 0).toLocaleString('en-IN')}`;
}

function renderIncomingRequests() {
  const container = document.getElementById('dashIncomingRequestsList');
  if (!container) return;

  const requests = store.getIncomingRequests();

  if (requests.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding: 28px 16px; color: var(--muted); font-size: 14px;">
        No pending job requests right now. Keep your availability turned on to receive new job leads.
      </div>
    `;
    return;
  }

  container.innerHTML = requests.map(req => `
    <div class="job-request-item" data-id="${req.id}">
      <div class="job-req-details">
        <h4>${req.customerName} · <span style="color:var(--orange); font-size:14px;">${req.offeredRate}</span></h4>
        <p>${req.description}</p>
        <div class="meta">
          <span>Location: ${req.location}</span>
          <span>Time: ${req.date}</span>
          <span>Phone: ${req.phone}</span>
        </div>
      </div>
      <div class="job-req-actions">
        <button class="btn secondary small decline-req-btn" data-id="${req.id}">Decline</button>
        <button class="btn primary small accept-req-btn" data-id="${req.id}">Accept Job</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.accept-req-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      store.acceptRequest(btn.dataset.id);
      renderIncomingRequests();
      renderWorkerJobs();
      if (window.showToast) window.showToast('Job request accepted! Added to active schedule.', 'success');
    });
  });

  container.querySelectorAll('.decline-req-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      store.declineRequest(btn.dataset.id);
      renderIncomingRequests();
      if (window.showToast) window.showToast('Job request declined', 'info');
    });
  });
}

function renderWorkerJobs() {
  const container = document.getElementById('dashActiveJobsList');
  if (!container) return;

  const bookings = store.getBookings().filter(b => b.status === 'confirmed');

  if (bookings.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding: 24px; color: var(--muted); font-size: 14px;">
        No active jobs right now. Accepted jobs will appear here.
      </div>
    `;
    return;
  }

  container.innerHTML = bookings.map(b => `
    <div class="job-request-item" style="border-left: 4px solid var(--green);">
      <div class="job-req-details">
        <h4>${b.customerName} · <span style="color:var(--ink); font-weight:800;">₹${b.amount}</span></h4>
        <p>${b.jobDescription || 'Scheduled customer service job'}</p>
        <div class="meta">
          <span>Location: ${b.location}</span>
          <span>Date: ${b.date} (${b.timeSlot})</span>
        </div>
      </div>
      <div class="job-req-actions">
        <button class="btn primary small finish-job-btn" data-id="${b.id}">Complete & Collect Pay</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.finish-job-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      store.updateBookingStatus(btn.dataset.id, 'completed');
      const metrics = store.getWorkerMetrics();
      store.updateWorkerMetrics({
        completedJobs: metrics.completedJobs + 1,
        totalEarnings: metrics.totalEarnings + 500,
        todayJobs: Math.max(0, metrics.todayJobs - 1)
      });
      renderWorkerJobs();
      if (window.showToast) window.showToast('Job completed! Payment collected.', 'success');
    });
  });
}
