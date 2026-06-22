// ====== DUMMY DATA ======
// Di versi backend nanti, ini akan diganti hasil fetch dari API/database.

const RESOURCES = [
  { id: "mb-1", type: "mobil", name: "Toyota Avanza", code: "B 1234 ABC", capacity: "7 kursi" },
  { id: "mb-2", type: "mobil", name: "Toyota Innova", code: "B 5678 DEF", capacity: "7 kursi" },
  { id: "mb-3", type: "mobil", name: "Honda Brio", code: "B 9012 GHI", capacity: "5 kursi" },
  { id: "rg-1", type: "ruangan", name: "Ruang Rapat Anggrek", code: "Lantai 2", capacity: "12 orang" },
  { id: "rg-2", type: "ruangan", name: "Ruang Rapat Melati", code: "Lantai 3", capacity: "6 orang" },
];

// Helper untuk generate tanggal relatif ke hari ini supaya demo selalu relevan
// (pakai komponen tanggal lokal, bukan toISOString, agar tidak geser timezone)
function dOffset(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const BOOKINGS = [
  { id: "bk-1", resourceId: "mb-1", date: dOffset(0), start: "08:00", end: "11:00", purpose: "Antar dokumen ke cabang Medan Kota", requester: "Budi Santoso", status: "approved" },
  { id: "bk-2", resourceId: "rg-1", date: dOffset(0), start: "13:00", end: "14:30", purpose: "Rapat koordinasi tim Finance", requester: "Siti Aminah", status: "approved" },
  { id: "bk-3", resourceId: "mb-2", date: dOffset(1), start: "09:00", end: "17:00", purpose: "Kunjungan klien ke Binjai", requester: "Andi Wijaya", status: "pending" },
  { id: "bk-4", resourceId: "rg-2", date: dOffset(2), start: "10:00", end: "11:00", purpose: "Interview kandidat staff baru", requester: "Dewi Lestari", status: "approved" },
  { id: "bk-5", resourceId: "rg-1", date: dOffset(2), start: "14:00", end: "16:00", purpose: "Presentasi laporan kuartal", requester: "Rudi Hartono", status: "pending" },
  { id: "bk-6", resourceId: "mb-3", date: dOffset(3), start: "07:30", end: "09:00", purpose: "Jemput tamu di airport", requester: "Lina Marpaung", status: "approved" },
  { id: "bk-7", resourceId: "mb-1", date: dOffset(5), start: "09:00", end: "12:00", purpose: "Survey lokasi gudang baru", requester: "Hendra Gunawan", status: "rejected" },
  { id: "bk-8", resourceId: "rg-2", date: dOffset(5), start: "09:00", end: "10:00", purpose: "Standup mingguan tim IT", requester: "Citra Dewi", status: "approved" },
  { id: "bk-9", resourceId: "mb-2", date: dOffset(8), start: "08:00", end: "10:00", purpose: "Distribusi barang promosi", requester: "Fajar Nugroho", status: "approved" },
  { id: "bk-10", resourceId: "rg-1", date: dOffset(8), start: "11:00", end: "12:30", purpose: "Rapat evaluasi vendor", requester: "Maya Putri", status: "pending" },
  { id: "bk-11", resourceId: "mb-3", date: dOffset(-2), start: "10:00", end: "12:00", purpose: "Antar proposal ke mitra", requester: "Agus Salim", status: "approved" },
  { id: "bk-12", resourceId: "rg-2", date: dOffset(12), start: "13:00", end: "15:00", purpose: "Training onboarding karyawan", requester: "Nadia Putri", status: "approved" },
];
