// ==========================================
// VALIDASI INPUT TRANSAKSI
// ==========================================
import { TYPES } from "./aggregate.js";
import { isValidDateString } from "./utils.js";

// Huruf, angka, spasi, titik, apostrof, dan tanda hubung (sama seperti versi awal)
const CATEGORY_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} .'-]*$/u;

export const MAX_AMOUNT = 9_999_999_999; // batas kolom numeric(12,2)
export const MAX_CATEGORY_LENGTH = 40;
export const MAX_DESCRIPTION_LENGTH = 200;

// Mengubah teks nominal gaya Indonesia menjadi angka.
//   "50.000" -> 50000   "Rp 1.250.000" -> 1250000   "50,5" -> 50.5
//   "50000"  -> 50000   "1.234,56" -> 1234.56        "abc" -> NaN
// Titik dianggap pemisah ribuan bila diikuti tepat tiga angka; koma adalah
// pemisah desimal. Tanpa ini, Number("50.000") menghasilkan 50, bukan 50000.
export function parseAmountText(text) {
  let clean = String(text ?? "").trim().replace(/^rp\.?/i, "").replace(/\s+/g, "");

  if (clean === "" || /[^\d.,]/.test(clean)) return NaN;

  if (clean.includes(",")) {
    // Koma = desimal, titik = ribuan
    const parts = clean.split(",");
    if (parts.length > 2) return NaN;
    const [intPart, decPart] = parts;
    if (!/^\d+(\.\d{3})*$|^\d*$/.test(intPart) || !/^\d*$/.test(decPart)) return NaN;
    clean = `${intPart.replace(/\./g, "") || "0"}.${decPart || "0"}`;
  } else if (/^\d{1,3}(\.\d{3})+$/.test(clean)) {
    clean = clean.replace(/\./g, ""); // "50.000" -> ribuan
  } else if ((clean.match(/\./g) || []).length > 1) {
    return NaN;
  }

  return Number(clean);
}

// Mengembalikan { ok: true, value } atau { ok: false, error }.
// savingsAvailable = tabungan yang masih bisa ditarik (dipakai untuk "withdraw").
export function validateTransaction(input, { savingsAvailable = Infinity } = {}) {
  const type = input.type;
  const amountText = String(input.amountText ?? "").trim();
  const category = String(input.category ?? "").trim();
  const date = String(input.date ?? "").trim();
  const description = String(input.description ?? "").trim();

  if (!TYPES.includes(type)) {
    return { ok: false, error: "Jenis transaksi tidak valid." };
  }

  if (!amountText || !category || !date) {
    return { ok: false, error: "Nominal, kategori, dan tanggal wajib diisi." };
  }

  const parsed = parseAmountText(amountText);

  if (Number.isNaN(parsed)) {
    return {
      ok: false,
      error: "Nominal harus berupa angka, contoh: 50000 atau 50.000."
    };
  }

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { ok: false, error: "Nominal harus lebih besar dari nol." };
  }

  const amount = Math.round(parsed * 100) / 100;

  if (amount < 0.01) {
    return { ok: false, error: "Nominal minimal Rp0,01." };
  }

  if (amount > MAX_AMOUNT) {
    return { ok: false, error: "Nominal terlalu besar." };
  }

  if (!CATEGORY_PATTERN.test(category)) {
    return { ok: false, error: "Format kategori tidak valid." };
  }

  if (category.length > MAX_CATEGORY_LENGTH) {
    return {
      ok: false,
      error: `Kategori maksimal ${MAX_CATEGORY_LENGTH} karakter.`
    };
  }

  if (!isValidDateString(date)) {
    return { ok: false, error: "Tanggal tidak valid." };
  }

  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return {
      ok: false,
      error: `Keterangan maksimal ${MAX_DESCRIPTION_LENGTH} karakter.`
    };
  }

  if (type === "withdraw" && amount > savingsAvailable) {
    return {
      ok: false,
      error: "Nominal melebihi total tabungan yang tersedia."
    };
  }

  return {
    ok: true,
    value: {
      type,
      amount,
      category,
      transaction_date: date,
      // Kolom description di database NOT NULL, jadi kirim "" bukan null
      description
    }
  };
}

// Validasi anggaran bulanan; kosong berarti tanpa anggaran (0).
export function parseBudget(text) {
  const clean = String(text ?? "").trim();
  if (clean === "") return { ok: true, value: 0 };

  const value = parseAmountText(clean);

  if (!Number.isFinite(value) || value < 0) {
    return { ok: false, error: "Anggaran harus berupa angka nol atau lebih." };
  }

  if (value > MAX_AMOUNT) {
    return { ok: false, error: "Anggaran terlalu besar." };
  }

  return { ok: true, value: Math.round(value) };
}
