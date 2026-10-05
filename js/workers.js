/**
 * Kaamzo Platform Workers Discovery, Profiles & Video KYC Registration
 * Includes Aadhaar verification, dynamic unique code generation, live video recording & video upload.
 */

import { store } from './store.js';
import { SERVICE_CATEGORIES, INDIAN_CITIES } from './data.js';
import { ICONS, getCategoryIconSvg } from './icons.js';

let currentFilter = {
  search: '',
  city: 'All Cities',
  category: 'all',
  sortBy: 'rating'
};

// Video KYC recording state
let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let kycVideoDataUrl = '';
let currentKycCode = '';

export function initWorkersModule() {
  renderCategoryPills();
  renderCityDropdown();
  renderWorkersList();
  setupFilterListeners();
  setupRegistrationFlow();
  setupDirectoryGpsListener();

  window.addEventListener('kaamzo:workers-updated', () => {
    renderWorkersList();
  });
}

/**
 * Setup GPS filter on Directory Page
 */
function setupDirectoryGpsListener() {
  const gpsBtn = document.getElementById('btnGpsFindNearMe');
  const citySelect = document.getElementById('filterCitySelect');
  if (!gpsBtn) return;

  gpsBtn.addEventListener('click', async () => {
    gpsBtn.disabled = true;
    gpsBtn.innerHTML = '<span>⏳</span> Locating...';

    try {
      const loc = await window.getLiveGpsLocation();
      if (loc.city) {
        // Find matching option in citySelect or add it
        let found = false;
        for (let i = 0; i < citySelect.options.length; i++) {
          if (citySelect.options[i].value.toLowerCase() === loc.city.toLowerCase()) {
            citySelect.selectedIndex = i;
            currentFilter.city = citySelect.options[i].value;
            found = true;
            break;
          }
        }
        if (!found) {
          const opt = document.createElement('option');
          opt.value = loc.city;
          opt.textContent = `📍 ${loc.city}`;
          citySelect.appendChild(opt);
          citySelect.value = loc.city;
          currentFilter.city = loc.city;
        }

        renderWorkersList();
        if (window.showToast) {
          window.showToast(`Found location: ${loc.city} (${loc.rawLocation})`, 'success');
        }
      }
    } catch (err) {
      alert(err.message || 'Could not fetch GPS location.');
    } finally {
      gpsBtn.disabled = false;
      gpsBtn.innerHTML = '<span>📍</span> Use Live GPS Location';
    }
  });
}

/**
 * Render category filter pills
 */
function renderCategoryPills() {
  const container = document.getElementById('categoryPillsContainer');
  if (!container) return;

  container.innerHTML = SERVICE_CATEGORIES.map(cat => `
    <button type="button" class="cat-pill ${cat.id === currentFilter.category ? 'active' : ''}" data-cat="${cat.id}">
      <span class="cat-pill-icon">${ICONS[cat.iconKey] || ''}</span> ${cat.name}
    </button>
  `).join('');

  container.querySelectorAll('.cat-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      currentFilter.category = btn.dataset.cat;
      renderWorkersList();
    });
  });
}

/**
 * Render city options in dropdown
 */
function renderCityDropdown() {
  const select = document.getElementById('filterCitySelect');
  if (!select) return;

  select.innerHTML = INDIAN_CITIES.map(city => `
    <option value="${city}">${city}</option>
  `).join('');
}

/**
 * Setup listeners for search, city, and sort inputs
 */
function setupFilterListeners() {
  const searchInput = document.getElementById('workerSearchInput');
  const citySelect = document.getElementById('filterCitySelect');
  const sortSelect = document.getElementById('workerSortSelect');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentFilter.search = e.target.value.toLowerCase().trim();
      renderWorkersList();
    });
  }

  if (citySelect) {
    citySelect.addEventListener('change', (e) => {
      currentFilter.city = e.target.value;
      renderWorkersList();
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      currentFilter.sortBy = e.target.value;
      renderWorkersList();
    });
  }

  // Clear filters button
  const clearBtn = document.getElementById('clearFiltersBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      currentFilter = { search: '', city: 'All Cities', category: 'all', sortBy: 'rating' };
      if (searchInput) searchInput.value = '';
      if (citySelect) citySelect.value = 'All Cities';
      if (sortSelect) sortSelect.value = 'rating';
      renderCategoryPills();
      renderWorkersList();
    });
  }
}

/**
 * Filter and render workers
 */
export function renderWorkersList() {
  const grid = document.getElementById('workersGrid');
  const countEl = document.getElementById('workerCountText');
  const emptyState = document.getElementById('workersEmptyState');
  if (!grid) return;

  const allWorkers = store.getWorkers(false);

  let filtered = allWorkers.filter(w => {
    // Search filter
    if (currentFilter.search) {
      const matchName = (w.name || '').toLowerCase().includes(currentFilter.search);
      const matchService = (w.service || '').toLowerCase().includes(currentFilter.search);
      const matchArea = (w.area || '').toLowerCase().includes(currentFilter.search);
      const matchSkills = (w.skills || []).some(s => s.toLowerCase().includes(currentFilter.search));
      if (!matchName && !matchService && !matchArea && !matchSkills) return false;
    }

    // City filter
    if (currentFilter.city !== 'All Cities' && w.city !== currentFilter.city) {
      return false;
    }

    // Category filter
    if (currentFilter.category !== 'all') {
      if (currentFilter.category === 'Mason / Construction') {
        if (!w.service.toLowerCase().includes('mason') && !w.service.toLowerCase().includes('construction')) return false;
      } else if (!w.service.toLowerCase().includes(currentFilter.category.toLowerCase())) {
        return false;
      }
    }

    return true;
  });

  // Sorting
  filtered.sort((a, b) => {
    if (currentFilter.sortBy === 'rating') {
      return (b.rating || 0) - (a.rating || 0);
    } else if (currentFilter.sortBy === 'rate-asc') {
      return a.rate - b.rate;
    } else if (currentFilter.sortBy === 'rate-desc') {
      return b.rate - a.rate;
    } else if (currentFilter.sortBy === 'experience') {
      return (b.experience || 0) - (a.experience || 0);
    }
    return 0;
  });

  if (countEl) {
    countEl.textContent = `Showing ${filtered.length} verified worker${filtered.length === 1 ? '' : 's'}`;
  }

  if (filtered.length === 0) {
    grid.innerHTML = '';
    if (emptyState) emptyState.style.display = 'block';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  grid.innerHTML = filtered.map(w => `
    <article class="worker-card" data-id="${w.id}">
      <div class="card-top">
        <div class="worker-avatar-lg">
          ${getCategoryIconSvg(w.service)}
          <span class="status-dot ${w.availability && w.availability.includes('Today') ? '' : 'busy'}"></span>
        </div>
        <div class="worker-meta">
          <h3>
            <span>${w.name}</span>
            <span class="badge-verified">Verified Pro</span>
          </h3>
          <div class="worker-trade-loc">
            <strong>${w.service}</strong> · ${w.city} ${w.area ? `(${w.area.split('&')[0].trim()})` : ''}
          </div>
          <div class="worker-rating-exp">
            <span class="stars">Rating: ${w.rating ? w.rating.toFixed(1) : '5.0'}</span>
            <span>· ${w.experience || 3} yrs exp</span>
            <span>· Instant Hire</span>
          </div>
        </div>
      </div>

      <div class="skills-tags">
        ${(w.skills || []).slice(0, 3).map(skill => `
          <span class="skill-tag">${skill}</span>
        `).join('')}
        ${(w.skills || []).length > 3 ? `<span class="skill-tag">+${w.skills.length - 3}</span>` : ''}
      </div>

      <div class="card-footer">
        <div class="rate-badge">
          <strong>₹${w.rate}</strong>
          <small>Per Day</small>
        </div>
        <div class="card-actions">
          <button class="btn secondary small view-profile-btn" data-id="${w.id}">View Profile</button>
          <button class="btn primary small book-worker-btn" data-id="${w.id}">Book</button>
        </div>
      </div>
    </article>
  `).join('');

  // Attach button events
  grid.querySelectorAll('.view-profile-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openWorkerProfileModal(btn.dataset.id);
    });
  });

  grid.querySelectorAll('.book-worker-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.openBookingModal) {
        window.openBookingModal(btn.dataset.id);
      }
    });
  });

  grid.querySelectorAll('.worker-card').forEach(card => {
    card.addEventListener('click', () => {
      openWorkerProfileModal(card.dataset.id);
    });
  });
}

/**
 * Worker Profile Modal
 */
export function openWorkerProfileModal(workerId) {
  const worker = store.getWorkerById(workerId);
  if (!worker) return;

  const modal = document.getElementById('workerProfileModal');
  if (!modal) return;

  const profAvatarEl = document.getElementById('profAvatar');
  if (profAvatarEl) {
    profAvatarEl.innerHTML = getCategoryIconSvg(worker.service);
  }
  document.getElementById('profName').textContent = worker.name;
  document.getElementById('profService').textContent = worker.service;
  document.getElementById('profCity').textContent = `${worker.city} ${worker.area ? '· ' + worker.area : ''}`;
  document.getElementById('profRating').textContent = `Rating: ${worker.rating ? worker.rating.toFixed(1) : '5.0'} (${worker.jobsCompleted || 0} jobs completed)`;
  document.getElementById('profRate').textContent = `₹${worker.rate}/day`;
  document.getElementById('profHourly').textContent = worker.hourlyRate ? `₹${worker.hourlyRate}/hr` : 'Daily booking';
  document.getElementById('profExp').textContent = `${worker.experience || 4} Years Experience`;
  document.getElementById('profAvailability').textContent = worker.availability || 'Available';
  document.getElementById('profAbout').textContent = worker.about || 'Dedicated local worker registered with Kaamzo.';

  const skillsWrap = document.getElementById('profSkills');
  if (skillsWrap) {
    skillsWrap.innerHTML = (worker.skills || []).map(s => `<span class="skill-tag">${s}</span>`).join('');
  }

  const servicesWrap = document.getElementById('profServicesOffered');
  if (servicesWrap) {
    const list = worker.servicesOffered || [
      { name: 'Standard daily service labour', price: `₹${worker.rate}/day` },
      { name: 'Minor repair & troubleshooting', price: '₹199 onwards' }
    ];
    servicesWrap.innerHTML = list.map(item => `
      <div class="summary-row">
        <span>${item.name}</span>
        <strong>${item.price}</strong>
      </div>
    `).join('');
  }

  const bookBtn = document.getElementById('profBookBtn');
  if (bookBtn) {
    bookBtn.onclick = () => {
      closeWorkerProfileModal();
      if (window.openBookingModal) {
        window.openBookingModal(worker.id);
      }
    };
  }

  modal.classList.add('show');
  document.body.style.overflow = 'hidden';
}

export function closeWorkerProfileModal() {
  const modal = document.getElementById('workerProfileModal');
  if (modal) modal.classList.remove('show');
  document.body.style.overflow = '';
}

/**
 * Setup Streamlined Easy Worker Registration with Live GPS & Policy Consent
 */
function setupRegistrationFlow() {
  const form = document.getElementById('workerRegisterForm');
  const gpsBtn = document.getElementById('btnRegDetectGps');
  const gpsStatus = document.getElementById('regGpsStatus');
  const successScreen = document.getElementById('regSuccessScreen');
  if (!form) return;

  // GPS Detect Button in Registration Form
  if (gpsBtn) {
    gpsBtn.addEventListener('click', async () => {
      gpsBtn.disabled = true;
      gpsBtn.innerHTML = '<span>⏳</span> Detecting GPS...';

      try {
        const loc = await window.getLiveGpsLocation();
        const citySelect = document.getElementById('regCity');
        const areaInput = document.getElementById('regArea');
        const addrInput = document.getElementById('regAddress');

        if (citySelect && loc.city) {
          let found = false;
          for (let i = 0; i < citySelect.options.length; i++) {
            if (citySelect.options[i].value.toLowerCase() === loc.city.toLowerCase()) {
              citySelect.selectedIndex = i;
              found = true;
              break;
            }
          }
          if (!found) {
            const opt = document.createElement('option');
            opt.value = loc.city;
            opt.textContent = loc.city;
            citySelect.appendChild(opt);
            citySelect.value = loc.city;
          }
        }

        if (areaInput && loc.area) {
          areaInput.value = loc.area;
        }

        if (addrInput && loc.address) {
          addrInput.value = loc.address;
        }

        if (gpsStatus) {
          gpsStatus.innerHTML = `
            <div class="gps-live-badge">
              <span class="pulse-dot"></span>
              <span>GPS Connected: ${loc.city}, ${loc.area || ''} (${loc.rawLocation})</span>
            </div>
          `;
        }

        if (window.showToast) {
          window.showToast(`GPS Location fetched: ${loc.city}, ${loc.area}`, 'success');
        }
      } catch (err) {
        alert(err.message || 'Could not fetch GPS location.');
      } finally {
        gpsBtn.disabled = false;
        gpsBtn.innerHTML = '<span>🛰️</span> Detect GPS Location';
      }
    });
  }

  // Format Aadhaar live input (XXXX-XXXX-XXXX)
  const aadhaarInput = document.getElementById('regAadhaar');
  if (aadhaarInput) {
    aadhaarInput.addEventListener('input', (e) => {
      let val = e.target.value.replace(/\D/g, '').substring(0, 12);
      let formatted = '';
      for (let i = 0; i < val.length; i++) {
        if (i === 4 || i === 8) formatted += '-';
        formatted += val[i];
      }
      e.target.value = formatted;
    });
  }

  // Easy Form Submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const termsConsent = document.getElementById('regTermsConsent');
    if (termsConsent && !termsConsent.checked) {
      alert('Please review and agree to the Kaamzo Terms of Service & Privacy Policy before submitting.');
      return;
    }

    const name = document.getElementById('regName').value.trim();
    const phone = document.getElementById('regPhone').value.trim();
    const email = document.getElementById('regEmail')?.value.trim() || '';
    const aadhaar = document.getElementById('regAadhaar')?.value.trim() || '';
    const service = document.getElementById('regService').value;
    const skillsRaw = document.getElementById('regSkills').value.trim();
    const experience = parseInt(document.getElementById('regExp').value, 10) || 1;
    const dailyRate = parseInt(document.getElementById('regDailyRate').value, 10) || 500;
    const hourlyRate = parseInt(document.getElementById('regHourlyRate')?.value, 10) || 80;
    const city = document.getElementById('regCity').value;
    const area = document.getElementById('regArea').value.trim();
    const address = document.getElementById('regAddress')?.value.trim() || '';
    const about = document.getElementById('regAbout')?.value.trim() || '';

    if (!name || !phone || !service || !city || !area) {
      alert('Please fill out all required fields.');
      return;
    }

    const skills = skillsRaw
      ? skillsRaw.split(',').map(s => s.trim()).filter(Boolean)
      : ['General ' + service + ' repairs', 'Installation'];

    const newWorkerData = {
      name,
      phone,
      email,
      aadhaarNumber: aadhaar || 'Self-Declared',
      service,
      skills,
      experience,
      rate: dailyRate,
      hourlyRate,
      city,
      area,
      address,
      about: about || `Skilled ${service} based in ${area || city}. Dedicated to reliable local work.`,
      avatarIcon: store.getIconForCategory(service),
      verified: true,
      status: 'active',
      kycStatus: 'approved',
      availability: 'Available Today'
    };

    const submitBtn = document.getElementById('regSubmitBtn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Registering Profile...';
    }

    try {
      const savedWorker = await store.addWorkerWithKyc(newWorkerData);

      // Set active session to worker
      store.setAuth({
        isLoggedIn: true,
        role: 'worker',
        workerId: savedWorker.id,
        workerName: savedWorker.name,
        workerService: savedWorker.service,
        city: savedWorker.city
      });

      // Show Success Screen
      form.style.display = 'none';
      if (successScreen) {
        successScreen.style.display = 'block';
        document.getElementById('regSummaryName').textContent = savedWorker.name;
        document.getElementById('regSummaryTrade').textContent = `${savedWorker.service} · ₹${savedWorker.rate}/day`;
        document.getElementById('regSummaryLoc').textContent = `${savedWorker.city}, ${savedWorker.area || 'Local Site'}`;
      }

      if (window.showToast) {
        window.showToast(`Welcome ${savedWorker.name}! Your profile is now live on Kaamzo.`, 'success');
      }
    } catch (err) {
      console.error('Registration error:', err);
      alert('Could not complete registration. Please try again.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Complete Registration & Go Live ✓';
      }
    }
  });

  // Success view profile button
  const viewProfileBtn = document.getElementById('regViewMyProfileBtn');
  if (viewProfileBtn) {
    viewProfileBtn.addEventListener('click', () => {
      const currentAuth = store.getAuth();
      if (currentAuth.workerId) {
        openWorkerProfileModal(currentAuth.workerId);
      }
    });
  }
}

