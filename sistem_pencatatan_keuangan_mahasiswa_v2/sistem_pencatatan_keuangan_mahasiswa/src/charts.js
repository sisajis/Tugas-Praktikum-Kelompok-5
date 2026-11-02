// ==========================================
// GRAFIK SVG SEDERHANA (TANPA LIBRARY)
// ==========================================
// Warna diatur lewat kelas CSS (lihat styles.css) agar ikut tema terang/gelap.

import { el, rupiah, rupiahCompact } from "./utils.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function svg(tag, attrs = {}, ...children) {
  const node = document.createElementNS(SVG_NS, tag);

  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, value);
  }

  for (const child of children) {
    if (child) node.append(child);
  }

  return node;
}

function textNode(content, attrs) {
  const node = svg("text", attrs);
  node.textContent = content;
  return node;
}

// Membulatkan batas atas sumbu agar setiap garis bantu berupa angka yang
// enak dibaca (mis. 0, 500 rb, 1 jt, 1,5 jt, 2 jt), bukan 1,3 jt / 3,8 jt.
const NICE_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

export function niceMax(value, ticks = 4) {
  if (!(value > 0)) return ticks;

  const rawStep = value / ticks;
  const exponent = 10 ** Math.floor(Math.log10(rawStep));
  const fraction = rawStep / exponent;
  const step = (NICE_STEPS.find((candidate) => candidate >= fraction - 1e-9) ?? 10) * exponent;

  return step * ticks;
}

// data: [{ label, income, expense, title }]
export function renderBarChart(container, data, options = {}) {
  const {
    height = 220,
    labelEvery = 1, // angka, atau "auto" untuk menyesuaikan dengan lebar layar
    labelWidth = 28, // perkiraan lebar satu label sumbu X (piksel)
    emptyText = "Belum ada data untuk ditampilkan.",
    ariaLabel = "Grafik pemasukan dan pengeluaran"
  } = options;

  container.replaceChildren();

  const hasData = data.some((item) => item.income > 0 || item.expense > 0);

  if (!hasData) {
    container.append(el("p", { class: "empty" }, emptyText));
    return;
  }

  // Lebar viewBox mengikuti lebar elemen supaya huruf tidak ikut mengecil
  const width = Math.max(container.clientWidth || 0, 280);
  const margin = { left: 42, right: 6, top: 10, bottom: 26 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const ticks = 4;
  const max = niceMax(Math.max(...data.flatMap((item) => [item.income, item.expense])), ticks);
  const step = innerWidth / data.length;
  const barWidth = Math.max(2, Math.min(14, step * 0.36));
  const every =
    labelEvery === "auto" ? Math.max(1, Math.ceil(labelWidth / step)) : labelEvery;

  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    class: "chart",
    role: "img",
    "aria-label": ariaLabel
  });

  // Garis bantu dan label sumbu Y
  for (let i = 0; i <= ticks; i++) {
    const y = margin.top + innerHeight - (innerHeight * i) / ticks;

    chart.append(
      svg("line", {
        x1: margin.left,
        x2: width - margin.right,
        y1: y,
        y2: y,
        class: "chart-grid"
      }),
      textNode(rupiahCompact((max * i) / ticks), {
        x: margin.left - 6,
        y: y + 3.5,
        "text-anchor": "end",
        class: "chart-label"
      })
    );
  }

  const barHeight = (value) =>
    value > 0 ? Math.max(1.5, (innerHeight * value) / max) : 0;

  data.forEach((item, index) => {
    const center = margin.left + step * index + step / 2;
    const incomeHeight = barHeight(item.income);
    const expenseHeight = barHeight(item.expense);

    const group = svg("g", { class: "chart-group" });

    group.append(
      // Area transparan agar mudah disentuh/di-hover
      svg("rect", {
        x: center - step / 2,
        y: margin.top,
        width: step,
        height: innerHeight,
        fill: "transparent"
      }),
      svg("rect", {
        x: center - barWidth - 0.5,
        y: margin.top + innerHeight - incomeHeight,
        width: barWidth,
        height: incomeHeight,
        rx: 2,
        class: "bar-income"
      }),
      svg("rect", {
        x: center + 0.5,
        y: margin.top + innerHeight - expenseHeight,
        width: barWidth,
        height: expenseHeight,
        rx: 2,
        class: "bar-expense"
      })
    );

    const title = svg("title");
    title.textContent =
      `${item.title ?? item.label}\n` +
      `Pemasukan: ${rupiah(item.income)}\nPengeluaran: ${rupiah(item.expense)}`;
    group.append(title);
    chart.append(group);

    if (index % every === 0) {
      chart.append(
        textNode(item.label, {
          x: center,
          y: height - 8,
          "text-anchor": "middle",
          class: "chart-label"
        })
      );
    }
  });

  container.append(chart);
}

// ---------- Daftar kategori dengan batang persentase ----------
const CATEGORY_COLORS = [
  "#2b4fd9", "#e0414a", "#d98a00", "#12995a", "#8b5cf6", "#0ea5b7", "#ec4899"
];
const OTHER_COLOR = "#8f98c0";

export function renderCategoryList(container, items, { limit = 6, emptyText } = {}) {
  container.replaceChildren();

  if (items.length === 0) {
    container.append(
      el("p", { class: "empty" }, emptyText ?? "Belum ada pengeluaran pada bulan ini.")
    );
    return;
  }

  let visible = items.slice(0, limit);

  if (items.length > limit) {
    const rest = items.slice(limit);
    visible = [
      ...visible,
      {
        category: `Lainnya (${rest.length})`,
        total: rest.reduce((sum, item) => sum + item.total, 0),
        count: rest.reduce((sum, item) => sum + item.count, 0),
        pct: rest.reduce((sum, item) => sum + item.pct, 0),
        isOther: true
      }
    ];
  }

  const list = el("ul", { class: "cat-list" });

  visible.forEach((item, index) => {
    const color = item.isOther ? OTHER_COLOR : CATEGORY_COLORS[index % CATEGORY_COLORS.length];
    const bar = el("i");
    bar.style.width = `${Math.max(item.pct, 1.5).toFixed(1)}%`;
    bar.style.background = color;

    const dot = el("span", { class: "cat-dot" });
    dot.style.background = color;

    list.append(
      el(
        "li",
        {},
        el(
          "div",
          { class: "cat-top" },
          dot,
          el("span", { class: "cat-name" }, item.category),
          el(
            "span",
            { class: "cat-value" },
            rupiah(item.total),
            el("small", {}, ` ${item.pct.toFixed(0)}%`)
          )
        ),
        el("div", { class: "cat-bar", "aria-hidden": "true" }, bar)
      )
    );
  });

  container.append(list);
}
