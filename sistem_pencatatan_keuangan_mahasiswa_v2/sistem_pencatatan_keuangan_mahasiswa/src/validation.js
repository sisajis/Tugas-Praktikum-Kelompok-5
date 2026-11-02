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

  const parsed = Number(amountText);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { ok: false, error: "Nominal harus berupa angka lebih besar dari nol." };
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

  const value = Number(clean);

  if (!Number.isFinite(value) || value < 0) {
    return { ok: false, error: "Anggaran harus berupa angka nol atau lebih." };
  }

  if (value > MAX_AMOUNT) {
    return { ok: false, error: "Anggaran terlalu besar." };
  }

  return { ok: true, value: Math.round(value) };
}
