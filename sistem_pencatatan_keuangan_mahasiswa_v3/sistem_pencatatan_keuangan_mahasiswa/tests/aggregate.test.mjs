// Jalankan: node --test tests/aggregate.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import {
  totals,
  dailyAccumulation,
  monthlyAccumulation,
  categoryBreakdown,
  monthInsights,
  budgetStatus,
  filterTransactions,
  groupByDate,
  monthsWithData
} from "../src/aggregate.js";
import { validateTransaction, parseBudget, parseAmountText } from "../src/validation.js";
import {
  rupiahCompact,
  shiftMonth,
  daysInMonth,
  formatDateLong,
  isValidDateString,
  greetingFor
} from "../src/utils.js";
import { buildCsv, buildReport } from "../src/export.js";
import { niceMax } from "../src/charts.js";

const tx = (type, amount, date, category = "Umum", description = "") => ({
  id: `${type}-${amount}-${date}`,
  type,
  amount,
  transaction_date: date,
  category,
  description
});

// Data contoh:
//   Agu: +1.000.000 (Uang saku)
//   Sep 01: +500.000, Sep 01: -50.000 (Makan), Sep 03: -30.000 (Makan),
//   Sep 03: tabung 100.000, Sep 10: tarik tabungan 40.000
//   Okt 02: -20.000 (Transport)
const data = [
  tx("income", 1000000, "2026-08-31", "Uang saku"),
  tx("income", 500000, "2026-09-01", "Beasiswa"),
  tx("expense", 50000, "2026-09-01", "Makan"),
  tx("expense", 30000, "2026-09-03", "makan"),
  tx("saving", 100000, "2026-09-03", "Dana darurat"),
  tx("withdraw", 40000, "2026-09-10", "Tarik tabungan"),
  tx("expense", 20000, "2026-10-02", "Transport")
];

test("totals: saldo = masuk - keluar - tabung + tarik", () => {
  const t = totals(data);
  assert.equal(t.income, 1500000);
  assert.equal(t.expense, 100000);
  assert.equal(t.saving, 100000);
  assert.equal(t.withdraw, 40000);
  assert.equal(t.netSaving, 60000);
  assert.equal(t.balance, 1500000 - 100000 - 100000 + 40000);
});

test("totals: tidak ada galat desimal", () => {
  const t = totals([tx("income", 0.1, "2026-01-01"), tx("income", 0.2, "2026-01-01")]);
  assert.equal(t.income, 0.3);
});

test("dailyAccumulation: akumulasi per tanggal dan saldo berjalan", () => {
  const result = dailyAccumulation(data, "2026-09");

  assert.equal(result.opening, 1000000);
  assert.equal(result.rows.length, 3); // tanggal 1, 3, 10
  assert.equal(result.activeDays, 3);
  assert.equal(result.daysInMonth, 30);

  const [d1, d3, d10] = result.rows;
  assert.equal(d1.date, "2026-09-01");
  assert.equal(d1.income, 500000);
  assert.equal(d1.expense, 50000);
  assert.equal(d1.closing, 1450000);

  assert.equal(d3.expense, 30000);
  assert.equal(d3.netSaving, 100000);
  assert.equal(d3.closing, 1450000 - 30000 - 100000);

  assert.equal(d10.netSaving, -40000);
  assert.equal(d10.closing, 1320000 + 40000);

  assert.equal(result.closing, 1360000);
  assert.equal(result.totals.income, 500000);
  // Transaksi bulan lain tidak ikut
  assert.ok(result.rows.every((r) => r.date.startsWith("2026-09")));
});

test("dailyAccumulation: includeEmpty menampilkan semua tanggal", () => {
  const result = dailyAccumulation(data, "2026-09", { includeEmpty: true });
  assert.equal(result.rows.length, 30);
  assert.equal(result.rows[1].count, 0); // 2 Sep tanpa transaksi
  assert.equal(result.rows[1].closing, 1450000); // saldo terbawa dari tanggal 1
  assert.equal(result.rows.at(-1).closing, result.closing);
});

test("dailyAccumulation: bulan tanpa transaksi mewarisi saldo awal", () => {
  const result = dailyAccumulation(data, "2026-11");
  assert.equal(result.rows.length, 0);
  assert.equal(result.opening, result.closing);
  assert.equal(result.closing, totals(data).balance);
});

test("monthlyAccumulation: 12 bulan dengan saldo kumulatif", () => {
  const result = monthlyAccumulation(data, 2026);
  assert.equal(result.rows.length, 12);

  const aug = result.rows[7];
  const sep = result.rows[8];
  const oct = result.rows[9];
  const nov = result.rows[10];

  assert.equal(aug.income, 1000000);
  assert.equal(aug.closing, 1000000);
  assert.equal(sep.income, 500000);
  assert.equal(sep.expense, 80000);
  assert.equal(sep.netSaving, 60000);
  assert.equal(sep.closing, 1000000 + 500000 - 80000 - 60000);
  assert.equal(oct.closing, sep.closing - 20000);
  assert.equal(nov.closing, oct.closing); // bulan kosong: saldo tetap
  assert.equal(result.closing, totals(data).balance);
  assert.equal(result.rows[0].closing, 0); // Januari kosong
});

test("monthlyAccumulation: tahun lain memakai saldo awal dari tahun sebelumnya", () => {
  const result = monthlyAccumulation(data, 2027);
  assert.equal(result.opening, totals(data).balance);
  assert.equal(result.rows[0].closing, result.opening);
});

test("categoryBreakdown: kategori digabung tanpa membedakan huruf besar", () => {
  const list = categoryBreakdown(data, "2026-09", "expense");
  assert.equal(list.length, 1);
  assert.equal(list[0].total, 80000);
  assert.equal(list[0].count, 2);
  assert.equal(Math.round(list[0].pct), 100);

  const year = categoryBreakdown(data, "2026", "expense");
  assert.equal(year.length, 2);
  assert.equal(year[0].category.toLowerCase(), "makan"); // terbesar dulu
});

test("monthInsights: rata-rata, hari terboros, kategori terbesar", () => {
  const insight = monthInsights(data, "2026-09", "2026-09-10");
  assert.equal(insight.elapsedDays, 10);
  assert.equal(insight.avgDailyExpense, 8000);
  assert.deepEqual(insight.topDay, { date: "2026-09-01", total: 50000 });
  assert.equal(insight.topCategory.total, 80000);
  assert.equal(insight.savingRate, (60000 / 500000) * 100);

  const past = monthInsights(data, "2026-09", "2026-10-31");
  assert.equal(past.elapsedDays, 30);

  const future = monthInsights(data, "2026-12", "2026-10-31");
  assert.equal(future.elapsedDays, 0);
  assert.equal(future.avgDailyExpense, 0);
  assert.equal(future.savingRate, null);
});

test("budgetStatus: level ok / warn / over", () => {
  assert.equal(budgetStatus(10, 0), null);
  assert.equal(budgetStatus(50, 100).level, "ok");
  assert.equal(budgetStatus(80, 100).level, "warn");
  assert.equal(budgetStatus(100, 100).level, "over");
  assert.equal(budgetStatus(150, 100).remaining, -50);
});

test("filterTransactions dan groupByDate", () => {
  assert.equal(filterTransactions(data, { month: "2026-09" }).length, 5);
  assert.equal(filterTransactions(data, { type: "expense" }).length, 3);
  assert.equal(filterTransactions(data, { query: "BEASISWA" }).length, 1);
  assert.equal(filterTransactions(data, { query: "zzz" }).length, 0);

  const groups = groupByDate(filterTransactions(data, { month: "2026-09" }));
  assert.equal(groups.length, 3);
  assert.equal(groups[0].items.length, 2);
  assert.equal(groups[0].totals.income, 500000);
});

test("monthsWithData: unik dan terbaru dulu", () => {
  assert.deepEqual(monthsWithData(data, "2026-11"), [
    "2026-11", "2026-10", "2026-09", "2026-08"
  ]);
});

test("validateTransaction: pesan kesalahan", () => {
  const base = {
    type: "expense",
    amountText: "25000",
    category: "Makan",
    date: "2026-09-25",
    description: ""
  };

  const ok = validateTransaction(base);
  assert.equal(ok.ok, true);
  assert.equal(ok.value.description, ""); // bukan null
  assert.equal(ok.value.amount, 25000);

  assert.equal(validateTransaction({ ...base, amountText: "" }).ok, false);
  assert.equal(validateTransaction({ ...base, amountText: "-5" }).ok, false);
  assert.equal(validateTransaction({ ...base, amountText: "abc" }).ok, false);
  assert.equal(validateTransaction({ ...base, amountText: "1e12" }).ok, false);
  assert.equal(validateTransaction({ ...base, category: "<b>x" }).error, "Format kategori tidak valid.");
  assert.equal(validateTransaction({ ...base, category: "x".repeat(41) }).ok, false);
  assert.equal(validateTransaction({ ...base, date: "2026-02-31" }).ok, false);
  assert.equal(validateTransaction({ ...base, type: "hack" }).ok, false);
});

test("validateTransaction: tarik tabungan tidak boleh melebihi tabungan", () => {
  const input = {
    type: "withdraw",
    amountText: "70000",
    category: "Tarik tabungan",
    date: "2026-09-25"
  };
  assert.equal(validateTransaction(input, { savingsAvailable: 60000 }).ok, false);
  assert.equal(validateTransaction(input, { savingsAvailable: 70000 }).ok, true);
});

test("parseBudget", () => {
  assert.deepEqual(parseBudget(""), { ok: true, value: 0 });
  assert.deepEqual(parseBudget("1500000"), { ok: true, value: 1500000 });
  assert.equal(parseBudget("-1").ok, false);
  assert.equal(parseBudget("abc").ok, false);
});

test("utils tanggal dan format", () => {
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(daysInMonth("2028-02"), 29);
  assert.equal(formatDateLong("2026-09-25"), "Jumat, 25 September 2026");
  assert.equal(isValidDateString("2026-02-29"), false);
  assert.equal(isValidDateString("2028-02-29"), true);
  assert.equal(rupiahCompact(1500000), "1,5 jt");
  assert.equal(rupiahCompact(250000), "250 rb");
  assert.equal(rupiahCompact(-2000000), "-2 jt");
  assert.equal(rupiahCompact(500), "500");
  assert.equal(greetingFor(new Date(2026, 8, 25, 14, 0)), "Selamat Siang");
  assert.equal(greetingFor(new Date(2026, 8, 25, 2, 0)), "Selamat Malam");
});

test("buildCsv: kutip, titik koma, dan perlindungan rumus", () => {
  const csv = buildCsv([
    tx("expense", 15000, "2026-09-01", "=HYPERLINK(x)", 'Beli "kopi"; manis')
  ]);
  const lines = csv.split("\r\n");
  assert.equal(lines[0], "Tanggal;Jenis;Kategori;Keterangan;Nominal");
  assert.ok(lines[1].includes("'=HYPERLINK(x)"));
  assert.ok(lines[1].includes('"Beli ""kopi""; manis"'));
  assert.ok(lines[1].endsWith(";15000"));
});

test("buildReport: bulanan dan tahunan, teks pengguna di-escape", () => {
  const evil = [tx("expense", 1000, "2026-09-02", "Makan", "<script>alert(1)</script>")];

  const monthly = buildReport({
    userName: "<b>Budi</b>",
    email: "b@x.id",
    scope: "month",
    monthKey: "2026-09",
    transactions: [...data, ...evil]
  });
  assert.ok(monthly.body.includes("Akumulasi per Tanggal"));
  assert.ok(!monthly.body.includes("<script>"));
  assert.ok(!monthly.body.includes("<b>Budi</b>"));
  assert.ok(monthly.body.includes("&lt;script&gt;"));
  assert.equal(monthly.count, 6);

  const yearly = buildReport({
    userName: "Budi",
    email: "b@x.id",
    scope: "year",
    monthKey: "2026-09",
    transactions: data
  });
  assert.ok(yearly.body.includes("Akumulasi per Bulan"));
  assert.equal(yearly.count, 7);
});

test("niceMax: garis bantu grafik berupa angka bulat", () => {
  assert.equal(niceMax(2000000), 2000000);
  assert.equal(niceMax(5000000), 6000000); // garis tiap 1,5 jt
  assert.equal(niceMax(1500000), 1600000);
  assert.equal(niceMax(0), 4);
  assert.equal(niceMax(90), 100);
});

test("parseAmountText: format Indonesia (titik ribuan, koma desimal)", () => {
  assert.equal(parseAmountText("50000"), 50000);
  assert.equal(parseAmountText("50.000"), 50000);
  assert.equal(parseAmountText("Rp 1.250.000"), 1250000);
  assert.equal(parseAmountText("50,5"), 50.5);
  assert.equal(parseAmountText("1.234,56"), 1234.56);
  assert.ok(Number.isNaN(parseAmountText("abc")));
  assert.ok(Number.isNaN(parseAmountText("12a")));
  assert.ok(Number.isNaN(parseAmountText("1e12")));
});

test("validateTransaction: nominal bertitik ribuan dan jenis nabung", () => {
  const base = { type: "saving", amountText: "50.000", category: "Dana darurat", date: "2026-11-03", description: "" };
  const ok = validateTransaction(base);
  assert.equal(ok.ok, true);
  assert.equal(ok.value.amount, 50000);
  assert.match(validateTransaction({ ...base, amountText: "abc" }).error, /Nominal harus berupa angka/);
});
