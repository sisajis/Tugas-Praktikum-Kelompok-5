// ==========================================
// LAPORAN: WORD, CSV, DAN CETAK/PDF
// ==========================================
// File Word dibuat dari HTML dengan header Microsoft Office (.doc).
// Cara ini tidak butuh library tambahan dan terbuka di Word, LibreOffice,
// maupun Google Docs. Semua teks dari pengguna di-escape terlebih dahulu.

import {
  TYPE_LABEL,
  totals,
  dailyAccumulation,
  monthlyAccumulation,
  categoryBreakdown
} from "./aggregate.js";
import {
  rupiah,
  escapeHtml as esc,
  formatDateShort,
  formatDateLong,
  todayString,
  monthLabel,
  monthName,
  weekdayShort
} from "./utils.js";

export const REPORT_CSS = `
.rpt{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:11pt;line-height:1.4}
.rpt h1{font-size:18pt;margin:0 0 4pt;color:#1f3bb8}
.rpt h2{font-size:13pt;margin:18pt 0 6pt;color:#1f3bb8}
.rpt p{margin:2pt 0}
.rpt table{border-collapse:collapse;width:100%;margin:4pt 0}
.rpt th,.rpt td{border:1px solid #c9d0ea;padding:4pt 6pt;font-size:10pt;text-align:left;vertical-align:top}
.rpt th{background:#e8ecfb}
.rpt .num{text-align:right;white-space:nowrap}
.rpt tfoot td{font-weight:bold;background:#f3f5fd}
.rpt .muted{color:#555}
`;

const num = (value) => `<td class="num">${value === 0 ? "-" : esc(rupiah(value))}</td>`;
const numAlways = (value) => `<td class="num">${esc(rupiah(value))}</td>`;

function sortAscending(list) {
  return [...list].sort(
    (a, b) =>
      a.transaction_date.localeCompare(b.transaction_date) ||
      String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""))
  );
}

// scope: "month" -> laporan satu bulan, "year" -> laporan satu tahun
export function buildReport({ userName, email, scope, monthKey, transactions }) {
  const year = monthKey.slice(0, 4);
  const prefix = scope === "year" ? year : monthKey;
  const periodText = scope === "year" ? `Tahun ${year}` : monthLabel(monthKey);
  const inPeriod = sortAscending(
    transactions.filter((item) => item.transaction_date.startsWith(prefix))
  );

  let opening;
  let closing;
  let periodTotals;
  let accumulationHtml;

  if (scope === "year") {
    const result = monthlyAccumulation(transactions, Number(year));
    opening = result.opening;
    closing = result.closing;
    periodTotals = result.totals;

    const rows = result.rows
      .map(
        (row) => `<tr>
          <td>${esc(monthName(row.month))}</td>
          ${num(row.income)}${num(row.expense)}${num(row.netSaving)}
          ${numAlways(row.closing)}
        </tr>`
      )
      .join("");

    accumulationHtml = `
      <h2>Akumulasi per Bulan</h2>
      <table>
        <thead><tr><th>Bulan</th><th>Pemasukan</th><th>Pengeluaran</th><th>Tabungan</th><th>Saldo Akhir</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td>Total</td>${numAlways(periodTotals.income)}${numAlways(periodTotals.expense)}${numAlways(periodTotals.netSaving)}${numAlways(closing)}</tr></tfoot>
      </table>`;
  } else {
    const result = dailyAccumulation(transactions, monthKey);
    opening = result.opening;
    closing = result.closing;
    periodTotals = result.totals;

    const rows = result.rows.length
      ? result.rows
          .map(
            (row) => `<tr>
              <td>${esc(weekdayShort(row.date))}, ${esc(formatDateShort(row.date))}</td>
              ${num(row.income)}${num(row.expense)}${num(row.netSaving)}
              ${numAlways(row.closing)}
            </tr>`
          )
          .join("")
      : `<tr><td colspan="5" class="muted">Belum ada transaksi pada bulan ini.</td></tr>`;

    accumulationHtml = `
      <h2>Akumulasi per Tanggal</h2>
      <table>
        <thead><tr><th>Tanggal</th><th>Pemasukan</th><th>Pengeluaran</th><th>Tabungan</th><th>Saldo Akhir</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td>Total</td>${numAlways(periodTotals.income)}${numAlways(periodTotals.expense)}${numAlways(periodTotals.netSaving)}${numAlways(closing)}</tr></tfoot>
      </table>`;
  }

  const categories = categoryBreakdown(transactions, prefix, "expense");
  const categoryHtml = categories.length
    ? `<h2>Pengeluaran per Kategori</h2>
       <table>
         <thead><tr><th>Kategori</th><th>Jumlah Transaksi</th><th>Total</th><th>Porsi</th></tr></thead>
         <tbody>${categories
           .map(
             (item) => `<tr>
               <td>${esc(item.category)}</td>
               <td class="num">${item.count}</td>
               ${numAlways(item.total)}
               <td class="num">${esc(item.pct.toFixed(1).replace(".", ","))}%</td>
             </tr>`
           )
           .join("")}</tbody>
       </table>`
    : "";

  const detailRows = inPeriod.length
    ? inPeriod
        .map(
          (item) => `<tr>
            <td>${esc(formatDateShort(item.transaction_date))}</td>
            <td>${esc(TYPE_LABEL[item.type] ?? item.type)}</td>
            <td>${esc(item.category)}</td>
            <td>${esc(item.description ?? "")}</td>
            ${numAlways(Number(item.amount))}
          </tr>`
        )
        .join("")
    : `<tr><td colspan="5" class="muted">Tidak ada transaksi pada periode ini.</td></tr>`;

  const body = `
    <div class="rpt">
      <h1>Laporan Keuangan</h1>
      <p><strong>Periode:</strong> ${esc(periodText)}</p>
      <p><strong>Disusun untuk:</strong> ${esc(userName)} (${esc(email)})</p>
      <p class="muted">Dicetak pada ${esc(formatDateLong(todayString()))}</p>

      <h2>Ringkasan</h2>
      <table>
        <tbody>
          <tr><td>Saldo awal periode</td>${numAlways(opening)}</tr>
          <tr><td>Total pemasukan</td>${numAlways(periodTotals.income)}</tr>
          <tr><td>Total pengeluaran</td>${numAlways(periodTotals.expense)}</tr>
          <tr><td>Menabung (bersih)</td>${numAlways(periodTotals.netSaving)}</tr>
        </tbody>
        <tfoot><tr><td>Saldo akhir periode</td>${numAlways(closing)}</tr></tfoot>
      </table>

      ${accumulationHtml}
      ${categoryHtml}

      <h2>Rincian Transaksi</h2>
      <table>
        <thead><tr><th>Tanggal</th><th>Jenis</th><th>Kategori</th><th>Keterangan</th><th>Nominal</th></tr></thead>
        <tbody>${detailRows}</tbody>
      </table>
    </div>`;

  return {
    title: `Laporan Keuangan - ${periodText}`,
    filenameBase: `Laporan-Keuangan-${prefix}`,
    css: REPORT_CSS,
    body,
    count: inPeriod.length,
    transactions: inPeriod,
    totals: periodTotals,
    opening,
    closing
  };
}

// ---------- Word (.doc) ----------
export function buildWordDocument({ title, css, body }) {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>${css}</style>
</head>
<body>${body}</body>
</html>`;
}

// ---------- CSV ----------
// Pemisah titik koma karena Excel berlokal Indonesia memakai ";" sebagai
// pemisah daftar. Sel teks yang diawali = + - @ diberi apostrof agar tidak
// dibaca sebagai rumus (CSV injection).
function csvCell(value, { text = false } = {}) {
  let output = String(value ?? "");

  if (text && /^[=+\-@\t\r]/.test(output)) output = `'${output}`;
  if (/[;"\r\n]/.test(output)) output = `"${output.replace(/"/g, '""')}"`;

  return output;
}

export function buildCsv(list) {
  const lines = [["Tanggal", "Jenis", "Kategori", "Keterangan", "Nominal"].join(";")];

  for (const item of list) {
    lines.push(
      [
        csvCell(item.transaction_date),
        csvCell(TYPE_LABEL[item.type] ?? item.type),
        csvCell(item.category, { text: true }),
        csvCell(item.description ?? "", { text: true }),
        csvCell(Number(item.amount))
      ].join(";")
    );
  }

  return lines.join("\r\n");
}

// ---------- Unduh file di browser ----------
export function downloadFile(filename, mimeType, content) {
  // "\ufeff" (BOM) membuat Word dan Excel membaca file sebagai UTF-8
  const blob = new Blob(["\ufeff", content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
