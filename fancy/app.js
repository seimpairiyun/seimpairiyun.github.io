// ====== STATE ======
let currentDate = new Date();
let activeTypes = new Set(["mobil", "ruangan"]);
let selectedDateStr = null;

const monthNames = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

// ====== HELPERS ======
// PENTING: jangan pakai toISOString() untuk tanggal lokal — itu mengonversi
// ke UTC dulu, jadi di zona waktu +7 (WIB) tanggalnya bisa mundur 1 hari.
// Fungsi di bawah ambil tahun/bulan/tanggal langsung dari objek Date lokal.
function fmtDateStr(d){
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtDateLong(dateStr){
  const d = new Date(dateStr + "T00:00:00");
  const days = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
  return `${days[d.getDay()]}, ${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()}`;
}

function getResource(id){ return RESOURCES.find(r => r.id === id); }

function bookingsForDate(dateStr){
  return BOOKINGS.filter(b => {
    const res = getResource(b.resourceId);
    return b.date === dateStr && activeTypes.has(res.type);
  }).sort((a,b) => a.start.localeCompare(b.start));
}

// ====== RENDER: SIDEBAR RESOURCE LIST ======
function renderResourceList(){
  const list = document.getElementById("resourceList");
  list.innerHTML = "";
  RESOURCES.filter(r => activeTypes.has(r.type)).forEach(r => {
    const chip = document.createElement("div");
    chip.className = "resource-chip";
    chip.innerHTML = `<strong>${r.type === "mobil" ? "🚗" : "🏛"} ${r.name}</strong><span>${r.code} · ${r.capacity}</span>`;
    list.appendChild(chip);
  });
}

// ====== RENDER: CALENDAR GRID ======
function renderCalendar(){
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  document.getElementById("monthLabel").textContent = `${monthNames[month]} ${year}`;

  const grid = document.getElementById("calendarGrid");
  grid.innerHTML = "";

  const firstOfMonth = new Date(year, month, 1);
  // Senin = 0 ... Minggu = 6
  const startOffset = (firstOfMonth.getDay() + 6) % 7;
  const startDate = new Date(year, month, 1 - startOffset);

  const todayStr = fmtDateStr(new Date());

  for(let i = 0; i < 42; i++){
    const cellDate = new Date(startDate);
    cellDate.setDate(startDate.getDate() + i);
    const cellStr = fmtDateStr(cellDate);
    const isOutside = cellDate.getMonth() !== month;
    const isToday = cellStr === todayStr;

    const cell = document.createElement("div");
    cell.className = "day-cell" + (isOutside ? " outside" : "") + (isToday ? " today" : "");
    cell.tabIndex = 0;
    cell.dataset.date = cellStr;

    const dayBookings = bookingsForDate(cellStr);

    // Versi teks lengkap — ditampilkan di tablet/desktop (lihat .day-tags di CSS)
    const visibleTags = dayBookings.slice(0, 3).map(b => {
      const res = getResource(b.resourceId);
      return `<div class="tag ${b.status}">
                <span class="tag-time">${b.start}</span>
                <span class="tag-name">${res.name}</span>
              </div>`;
    }).join("");
    const moreCount = dayBookings.length - 3;
    const moreHtml = moreCount > 0 ? `<div class="tag-more">+${moreCount} lainnya</div>` : "";

    // Versi dot ringkas — ditampilkan di mobile kecil (lihat .day-dots di CSS)
    const visibleDots = dayBookings.slice(0, 4).map(b =>
      `<span class="day-dot ${b.status}"></span>`
    ).join("");
    const dotMoreCount = dayBookings.length - 4;
    const dotMoreHtml = dotMoreCount > 0 ? `<span class="day-dot-more">+${dotMoreCount}</span>` : "";

    cell.innerHTML = `
      <div class="day-number">${cellDate.getDate()}</div>
      <div class="day-tags">${visibleTags}${moreHtml}</div>
      <div class="day-dots">${visibleDots}${dotMoreHtml}</div>
    `;

    cell.addEventListener("click", () => openDrawer(cellStr));
    cell.addEventListener("keydown", (e) => { if(e.key === "Enter") openDrawer(cellStr); });

    grid.appendChild(cell);
  }
}

// ====== DRAWER: DAY DETAIL ======
function openDrawer(dateStr){
  selectedDateStr = dateStr;
  document.getElementById("drawerDate").textContent = fmtDateLong(dateStr);

  const body = document.getElementById("drawerBody");
  const dayBookings = bookingsForDate(dateStr);

  if(dayBookings.length === 0){
    body.innerHTML = `
      <div class="empty-day">
        <strong>Belum ada jadwal</strong>
        <span>Tanggal ini masih kosong untuk semua unit yang ditampilkan.</span>
      </div>`;
  } else {
    body.innerHTML = dayBookings.map(b => {
      const res = getResource(b.resourceId);
      const statusLabel = { approved:"Disetujui", pending:"Menunggu", rejected:"Ditolak" }[b.status];
      return `
        <div class="booking-card type-${res.type}">
          <div class="booking-card-top">
            <span class="booking-time">${b.start} – ${b.end}</span>
            <span class="status-pill ${b.status}">${statusLabel}</span>
          </div>
          <div class="booking-resource">${res.type === "mobil" ? "🚗" : "🏛"} ${res.name} <span style="color:var(--ink-faint); font-weight:400;">· ${res.code}</span></div>
          <div class="booking-purpose">${b.purpose}</div>
          <div class="booking-requester">👤 ${b.requester}</div>
        </div>`;
    }).join("");
  }

  document.getElementById("drawerOverlay").classList.add("open");
}

function closeDrawer(){
  document.getElementById("drawerOverlay").classList.remove("open");
}

// ====== MODAL: NEW BOOKING ======
let currentFormType = "mobil";

function populateResourceSelect(){
  const select = document.getElementById("resourceSelect");
  select.innerHTML = "";
  RESOURCES.filter(r => r.type === currentFormType).forEach(r => {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = `${r.name} (${r.code})`;
    select.appendChild(opt);
  });
  checkAvailability();
}

function openModal(prefillDate){
  document.getElementById("modalOverlay").classList.add("open");
  populateResourceSelect();
  const dateInput = document.getElementById("dateInput");
  dateInput.value = prefillDate || fmtDateStr(new Date());
  checkAvailability();
}

function closeModal(){
  document.getElementById("modalOverlay").classList.remove("open");
  document.getElementById("bookingForm").reset();
  document.getElementById("availabilityNote").classList.remove("show");
}

// ====== CEK BENTROK JADWAL SEDERHANA ======
function checkAvailability(){
  const resourceId = document.getElementById("resourceSelect").value;
  const date = document.getElementById("dateInput").value;
  const start = document.getElementById("startTime").value;
  const end = document.getElementById("endTime").value;
  const note = document.getElementById("availabilityNote");

  if(!resourceId || !date || !start || !end){
    note.classList.remove("show");
    return;
  }

  const conflict = BOOKINGS.find(b =>
    b.resourceId === resourceId &&
    b.date === date &&
    b.status !== "rejected" &&
    start < b.end && end > b.start
  );

  note.classList.add("show");
  if(conflict){
    note.classList.remove("ok");
    note.classList.add("conflict");
    note.textContent = `⚠ Bentrok dengan jadwal ${conflict.start}–${conflict.end} (${conflict.purpose})`;
  } else {
    note.classList.remove("conflict");
    note.classList.add("ok");
    note.textContent = `✓ Unit tersedia pada slot waktu ini`;
  }
}

// ====== EVENT BINDINGS ======
document.addEventListener("DOMContentLoaded", () => {
  renderResourceList();
  renderCalendar();

  // Sidebar toggle (mobile burger menu)
  const sidebar = document.getElementById("sidebar");
  const scrim = document.getElementById("sidebarScrim");

  function openSidebar(){
    sidebar.classList.add("open");
    scrim.classList.add("open");
    document.body.classList.add("sidebar-locked");
  }
  function closeSidebar(){
    sidebar.classList.remove("open");
    scrim.classList.remove("open");
    document.body.classList.remove("sidebar-locked");
  }

  document.getElementById("openSidebarBtn").addEventListener("click", openSidebar);
  document.getElementById("closeSidebarBtn").addEventListener("click", closeSidebar);
  scrim.addEventListener("click", closeSidebar);

  // Mobile "+" button in topbar opens the same booking modal
  document.getElementById("btnNewBookingMobile").addEventListener("click", () => openModal());

  // Close sidebar automatically if window is resized to desktop width
  window.addEventListener("resize", () => {
    if(window.innerWidth >= 900) closeSidebar();
  });

  // Filter checkboxes
  document.querySelectorAll(".filter-type").forEach(cb => {
    cb.addEventListener("change", () => {
      activeTypes = new Set(
        [...document.querySelectorAll(".filter-type:checked")].map(c => c.value)
      );
      renderResourceList();
      renderCalendar();
    });
  });

  // Month navigation
  document.getElementById("prevMonth").addEventListener("click", () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
  });
  document.getElementById("nextMonth").addEventListener("click", () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
  });
  document.getElementById("todayBtn").addEventListener("click", () => {
    currentDate = new Date();
    renderCalendar();
  });

  // Drawer
  document.getElementById("closeDrawer").addEventListener("click", closeDrawer);
  document.getElementById("drawerOverlay").addEventListener("click", (e) => {
    if(e.target.id === "drawerOverlay") closeDrawer();
  });
  document.getElementById("drawerNewBooking").addEventListener("click", () => {
    closeDrawer();
    openModal(selectedDateStr);
  });

  // Modal open/close
  document.getElementById("btnNewBooking").addEventListener("click", () => openModal());
  document.getElementById("closeModal").addEventListener("click", closeModal);
  document.getElementById("cancelModal").addEventListener("click", closeModal);
  document.getElementById("modalOverlay").addEventListener("click", (e) => {
    if(e.target.id === "modalOverlay") closeModal();
  });

  // Segmented control (jenis resource di form)
  document.querySelectorAll(".seg-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".seg-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentFormType = btn.dataset.type;
      populateResourceSelect();
    });
  });

  // Live availability check
  ["resourceSelect","dateInput","startTime","endTime"].forEach(id => {
    document.getElementById(id).addEventListener("change", checkAvailability);
  });

  // Submit form (demo only — belum ada backend)
  document.getElementById("bookingForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const resourceId = document.getElementById("resourceSelect").value;
    const res = getResource(resourceId);
    const date = document.getElementById("dateInput").value;
    const start = document.getElementById("startTime").value;
    const end = document.getElementById("endTime").value;
    const purpose = document.getElementById("purposeInput").value;
    const requester = document.getElementById("nameInput").value;

    BOOKINGS.push({
      id: "bk-" + Date.now(),
      resourceId, date, start, end, purpose, requester,
      status: "pending"
    });

    closeModal();
    renderCalendar();
    alert(`Pengajuan berhasil dikirim!\n\n${res.name} · ${date}\n${start}–${end}\nStatus: Menunggu persetujuan`);
  });
});
