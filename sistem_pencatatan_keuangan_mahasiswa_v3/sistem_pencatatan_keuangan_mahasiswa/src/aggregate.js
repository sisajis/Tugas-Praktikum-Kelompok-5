// ==========================================
// PERHITUNGAN KEUANGAN (TANPA DOM, MUDAH DIUJI)
// ==========================================
// Aturan saldo:
//   saldo = pemasukan - pengeluaran - menabung + tarik tabungan
// Uang yang ditabung keluar dari saldo dan masuk ke "total tabungan".
// Tarik tabungan mengembalikan uang itu ke saldo.
//
// Semua penjumlahan memakai satuan sen (bilangan bulat) supaya hasil
// seperti 0,1 + 0,2 tidak menghasilkan 0,30000000000000004.

import { daysInMonth } from "./utils.js";

export const TYPES = ["income", "expense", "saving", "withdraw"];

export const TYPE_LABEL = {
  income: "Pemasukan",
  expense: "Pengeluaran",
  saving: "Tabungan",
  withdraw: "Tarik Tabungan"
};

const pad = (n) => String(n).padStart(2, "0");
const toCents = (value) => Math.round(Number(value) * 100);

// ---------- Penjumlahan dasar ----------
function sumCents(list) {
  const sum = { income: 0, expense: 0, saving: 0, withdraw: 0 };

  for (const item of list) {
    const cents = toCents(item.amount);
    if (!Number.isFinite(cents) || !(item.type in sum)) continue;
    sum[item.type] += cents;
  }

  return sum;
}

const balanceCents = (sum) =>
  sum.income - sum.expense - sum.saving + sum.withdraw;

function toView(sum) {
  return {
    income: sum.income / 100,
    expense: sum.expense / 100,
    saving: sum.saving / 100,
    withdraw: sum.withdraw / 100,
    netSaving: (sum.saving - sum.withdraw) / 100, // tabungan bersih
    net: (sum.income - sum.expense) / 100, // arus kas (tanpa tabungan)
    balance: balanceCents(sum) / 100
  };
}

export const totals = (list) => toView(sumCents(list));

// ---------- Akumulasi per tanggal ----------
// Hasilnya satu baris per tanggal dalam bulan "YYYY-MM":
// total pemasukan, pengeluaran, tabungan, dan saldo akhir hari itu
// (saldo awal bulan + semua transaksi sampai tanggal tersebut).
export function dailyAccumulation(transactions, monthKey, { includeEmpty = false } = {}) {
  const start = `${monthKey}-01`;
  const before = [];
  const inMonth = [];
  const byDate = new Map();

  for (const item of transactions) {
    const date = item.transaction_date;

    if (date < start) {
      before.push(item);
    } else if (date.slice(0, 7) === monthKey) {
      inMonth.push(item);
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date).push(item);
    }
  }

  const openingC = balanceCents(sumCents(before));
  const lastDay = daysInMonth(monthKey);
  const rows = [];
  let running = openingC;

  for (let day = 1; day <= lastDay; day++) {
    const date = `${monthKey}-${pad(day)}`;
    const items = byDate.get(date) ?? [];
    const sum = sumCents(items);

    running += balanceCents(sum);

    if (items.length === 0 && !includeEmpty) continue;

    rows.push({
      date,
      day,
      ...toView(sum),
      count: items.length,
      closing: running / 100,
      items
    });
  }

  return {
    opening: openingC / 100,
    rows,
    totals: totals(inMonth),
    closing: running / 100,
    activeDays: byDate.size,
    daysInMonth: lastDay
  };
}

// ---------- Akumulasi per bulan ----------
// Selalu 12 baris (Januari-Desember) untuk tahun yang dipilih.
export function monthlyAccumulation(transactions, year) {
  const yearText = String(year);
  const start = `${yearText}-01-01`;
  const before = [];
  const inYear = [];
  const byMonth = Array.from({ length: 12 }, () => []);

  for (const item of transactions) {
    const date = item.transaction_date;

    if (date < start) {
      before.push(item);
    } else if (date.slice(0, 4) === yearText) {
      inYear.push(item);
      byMonth[Number(date.slice(5, 7)) - 1].push(item);
    }
  }

  const openingC = balanceCents(sumCents(before));
  let running = openingC;

  const rows = byMonth.map((items, index) => {
    const sum = sumCents(items);
    running += balanceCents(sum);

    return {
      month: index + 1,
      monthKey: `${yearText}-${pad(index + 1)}`,
      ...toView(sum),
      count: items.length,
      closing: running / 100
    };
  });

  return {
    opening: openingC / 100,
    rows,
    totals: totals(inYear),
    closing: running / 100
  };
}

// ---------- Rincian per kategori ----------
// prefix boleh "2026-09" (satu bulan) atau "2026" (satu tahun).
export function categoryBreakdown(transactions, prefix, type = "expense") {
  const groups = new Map();
  let grandTotal = 0;

  for (const item of transactions) {
    if (item.type !== type) continue;
    if (prefix && !item.transaction_date.startsWith(prefix)) continue;

    const label = String(item.category).trim();
    const key = label.toLowerCase();
    const cents = toCents(item.amount);
    const entry = groups.get(key) ?? { category: label, cents: 0, count: 0 };

    entry.cents += cents;
    entry.count += 1;
    grandTotal += cents;
    groups.set(key, entry);
  }

  return [...groups.values()]
    .sort((a, b) => b.cents - a.cents)
    .map((entry) => ({
      category: entry.category,
      total: entry.cents / 100,
      count: entry.count,
      pct: grandTotal > 0 ? (entry.cents / grandTotal) * 100 : 0
    }));
}

// ---------- Insight bulanan ----------
export function monthInsights(transactions, monthKey, today) {
  const inMonth = transactions.filter(
    (item) => item.transaction_date.slice(0, 7) === monthKey
  );
  const sum = totals(inMonth);
  const todayMonth = today.slice(0, 7);

  // Berapa hari yang sudah berjalan di bulan itu (untuk rata-rata harian)
  let elapsedDays = 0;
  if (monthKey < todayMonth) elapsedDays = daysInMonth(monthKey);
  else if (monthKey === todayMonth) elapsedDays = Number(today.slice(8, 10));

  const expenseByDate = new Map();
  for (const item of inMonth) {
    if (item.type !== "expense") continue;
    const date = item.transaction_date;
    expenseByDate.set(date, (expenseByDate.get(date) ?? 0) + toCents(item.amount));
  }

  let topDay = null;
  for (const [date, cents] of expenseByDate) {
    if (!topDay || cents > topDay.cents) topDay = { date, cents };
  }

  const categories = categoryBreakdown(inMonth, monthKey, "expense");

  return {
    totals: sum,
    elapsedDays,
    avgDailyExpense: elapsedDays > 0 ? sum.expense / elapsedDays : 0,
    topDay: topDay ? { date: topDay.date, total: topDay.cents / 100 } : null,
    topCategory: categories[0] ?? null,
    savingRate: sum.income > 0 ? (sum.netSaving / sum.income) * 100 : null
  };
}

// ---------- Anggaran ----------
export function budgetStatus(spent, budget) {
  if (!(budget > 0)) return null;

  const pct = (spent / budget) * 100;

  return {
    pct,
    remaining: budget - spent,
    level: pct >= 100 ? "over" : pct >= 80 ? "warn" : "ok"
  };
}

// ---------- Filter dan pengelompokan riwayat ----------
export function filterTransactions(list, { month = "all", type = "all", query = "" } = {}) {
  const needle = query.trim().toLowerCase();

  return list.filter((item) => {
    if (month !== "all" && item.transaction_date.slice(0, 7) !== month) return false;
    if (type !== "all" && item.type !== type) return false;
    if (needle) {
      const haystack = `${item.category} ${item.description ?? ""}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

// Mengelompokkan per tanggal tanpa mengubah urutan masukan.
export function groupByDate(list) {
  const groups = [];
  const index = new Map();

  for (const item of list) {
    const date = item.transaction_date;
    if (!index.has(date)) {
      const group = { date, items: [] };
      index.set(date, group);
      groups.push(group);
    }
    index.get(date).items.push(item);
  }

  return groups.map((group) => ({ ...group, totals: totals(group.items) }));
}

// Daftar bulan ("YYYY-MM") yang memiliki transaksi, terbaru di atas.
export function monthsWithData(list, extraMonth) {
  const set = new Set(list.map((item) => item.transaction_date.slice(0, 7)));
  if (extraMonth) set.add(extraMonth);
  return [...set].sort().reverse();
}
