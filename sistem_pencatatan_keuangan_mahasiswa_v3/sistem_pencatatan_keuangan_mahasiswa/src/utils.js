// ==========================================
// FUNGSI BANTU: FORMAT RUPIAH, TANGGAL, DAN DOM
// ==========================================
// Semua tanggal transaksi disimpan sebagai teks "YYYY-MM-DD".
// Sengaja tidak memakai toISOString() karena akan bergeser ke UTC
// (di WIB, transaksi dini hari bisa tercatat di tanggal kemarin).

const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];
const BULAN_SINGKAT = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des"
];

const pad = (n) => String(n).padStart(2, "0");

// ---------- Format angka ----------
export function rupiah(value) {
  // Intl memakai spasi tak-terpisah setelah "Rp"; diganti spasi biasa supaya
  // di layar sempit angka bisa turun ke baris berikutnya dan tidak meluber.
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  })
    .format(Number(value) || 0)
    .replace(/\u00a0/g, " ");
}

// Angka tanpa simbol "Rp" (dipakai di tabel; satuan ada di judul kolom)
export function angka(value) {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(
    Number(value) || 0
  );
}

// Merapikan isian nominal saat diketik: hanya angka dan satu koma desimal,
// ribuan dipisah titik. "1250000" -> "1.250.000", "12a3,456" -> "123,45"
export function formatAmountInput(raw) {
  const s = String(raw ?? "").replace(/[^\d,]/g, "");
  const comma = s.indexOf(",");
  let intPart = comma === -1 ? s : s.slice(0, comma);
  const dec = comma === -1 ? null : s.slice(comma + 1).replace(/,/g, "").slice(0, 2);

  intPart = intPart.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return dec === null ? intPart : `${intPart},${dec}`;
}

// Nilai angka -> teks isian: 50000 -> "50.000", 50.5 -> "50,5"
export function amountToInput(value) {
  const number = Number(value) || 0;
  return formatAmountInput(String(number).replace(".", ","));
}

// Format ringkas untuk sumbu grafik: 1,5 jt / 250 rb
export function rupiahCompact(value) {
  const number = Number(value) || 0;
  const sign = number < 0 ? "-" : "";
  const abs = Math.abs(number);
  const fmt = (x, unit) =>
    `${sign}${(Math.round(x * 10) / 10).toString().replace(".", ",")} ${unit}`;

  if (abs >= 1e9) return fmt(abs / 1e9, "M");
  if (abs >= 1e6) return fmt(abs / 1e6, "jt");
  if (abs >= 1e3) return fmt(abs / 1e3, "rb");
  return `${sign}${Math.round(abs)}`;
}

// ---------- Tanggal ----------
export const toDateString = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const todayString = () => toDateString(new Date());

export const currentMonthKey = () => todayString().slice(0, 7);

export function parseDate(text) {
  const [year, month, day] = text.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function isValidDateString(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text || "")) return false;
  const date = parseDate(text);
  return toDateString(date) === text;
}

// "Jumat, 25 September 2026"
export function formatDateLong(text) {
  const date = parseDate(text);
  return `${HARI[date.getDay()]}, ${date.getDate()} ${BULAN[date.getMonth()]} ${date.getFullYear()}`;
}

// "25 Sep 2026"
export function formatDateShort(text) {
  const date = parseDate(text);
  return `${date.getDate()} ${BULAN_SINGKAT[date.getMonth()]} ${date.getFullYear()}`;
}

// "Sen" / "Sel" ... untuk kolom tanggal di tabel
export function weekdayShort(text) {
  return HARI[parseDate(text).getDay()].slice(0, 3);
}

// "2026-09" -> "September 2026"
export function monthLabel(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return `${BULAN[month - 1]} ${year}`;
}

// 1..12 -> "Jan".."Des"
export const monthShortName = (month) => BULAN_SINGKAT[month - 1];
export const monthName = (month) => BULAN[month - 1];

// Geser bulan: shiftMonth("2026-01", -1) -> "2025-12"
export function shiftMonth(monthKey, delta) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function daysInMonth(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month, 0).getDate();
}

export function greetingFor(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 4 && hour < 11) return "Selamat Pagi";
  if (hour >= 11 && hour < 15) return "Selamat Siang";
  if (hour >= 15 && hour < 18) return "Selamat Sore";
  return "Selamat Malam";
}

// ---------- Teks ----------
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function initialOf(name) {
  const trimmed = String(name || "").trim();
  return trimmed ? trimmed[0].toUpperCase() : "?";
}

// Nama tampilan bawaan: bagian email sebelum "@"
export function nameFromEmail(email) {
  return String(email || "").split("@")[0] || "Pengguna";
}

// ---------- DOM ----------
// el("div", { class: "x" }, "teks", elemenLain)
// Teks anak selalu lewat text node, jadi aman dari injeksi HTML.
// Properti "html" hanya dipakai untuk markup tetap milik aplikasi (ikon SVG).
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;

    if (key === "class") node.className = value;
    else if (key === "html") node.innerHTML = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, value === true ? "" : value);
  }

  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }

  return node;
}

export function debounce(fn, wait = 200) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
