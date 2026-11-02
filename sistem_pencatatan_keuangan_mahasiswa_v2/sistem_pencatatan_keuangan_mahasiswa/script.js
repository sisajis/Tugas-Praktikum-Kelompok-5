import { supabase, isSupabaseConfigured } from "./supabase-config.js";
import { icon, hydrateIcons, TYPE_ICON } from "./src/icons.js";
import {
  rupiah,
  angka,
  todayString,
  currentMonthKey,
  formatDateLong,
  formatDateShort,
  weekdayShort,
  monthLabel,
  monthName,
  monthShortName,
  shiftMonth,
  greetingFor,
  initialOf,
  nameFromEmail,
  el,
  debounce
} from "./src/utils.js";
import {
  TYPE_LABEL,
  totals,
  dailyAccumulation,
  monthlyAccumulation,
  categoryBreakdown,
  monthInsights,
  budgetStatus,
  filterTransactions,
  groupByDate,
  monthsWithData
} from "./src/aggregate.js";
import { validateTransaction, parseBudget } from "./src/validation.js";
import { renderBarChart, renderCategoryList } from "./src/charts.js";
import { buildReport, buildWordDocument, buildCsv, downloadFile } from "./src/export.js";

// ==========================================
// 1. MENGAMBIL ELEMEN HTML
// ==========================================
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const authSection = $("#auth-section");
const authForm = $("#auth-form");
const authTitle = $("#auth-title");
const authEmail = $("#auth-email");
const authPassword = $("#auth-password");
const authSubmit = $("#auth-submit");
const authToggle = $("#auth-toggle");
const resendConfirmationButton = $("#resend-confirmation");
const authMessage = $("#auth-message");

const appSection = $("#app-section");
const signOutButton = $("#sign-out");

const form = $("#transaction-form");
const message = $("#message");

let isSignUp = false;
let isRegistering = false; // true selama proses daftar berlangsung

// Seluruh data aplikasi disimpan di satu objek agar mudah ditelusuri
const state = {
  user: null,
  transactions: [],
  view: "home",
  month: currentMonthKey(), // bulan yang sedang dilihat (format YYYY-MM)
  accumTab: "daily",
  showAllDays: false,
  reportScope: "month",
  formType: "expense",
  editingId: null,
  history: { month: "all", type: "all", query: "", limit: 100 }
};

const VIEW_NAMES = [
  "home", "add", "history", "accumulation", "activity", "report", "settings"
];

const CATEGORY_SUGGESTIONS = {
  income: ["Uang saku", "Beasiswa", "Freelance", "Hadiah", "Lainnya"],
  expense: [
    "Makan", "Transport", "Kuliah dan Buku", "Kos dan Listrik",
    "Pulsa dan Internet", "Hiburan", "Belanja", "Kesehatan", "Lainnya"
  ],
  saving: ["Tabungan umum", "Dana darurat", "Tujuan khusus"],
  withdraw: ["Tarik tabungan"]
};

const CATEGORY_PLACEHOLDER = {
  income: "Contoh: Uang saku",
  expense: "Contoh: Makan siang",
  saving: "Contoh: Dana darurat",
  withdraw: "Contoh: Tarik tabungan"
};

// Tanda di depan nominal pada daftar transaksi
const AMOUNT_SIGN = { income: "+", expense: "-", saving: "-", withdraw: "+" };

// ==========================================
// 2. PESAN, TOAST, DAN KONFIRMASI
// ==========================================
function getErrorMessage(error) {
  const raw = error?.message || "Terjadi kesalahan yang tidak diketahui.";

  // Database lama belum mengenal jenis "saving" dan "withdraw"
  if (/transactions_type_check/i.test(raw)) {
    return "Database belum mendukung jenis transaksi ini. Jalankan supabase/migration_v2.sql di SQL Editor Supabase.";
  }

  return raw;
}

let toastTimer;

function showToast(text, kind = "info") {
  const toast = $("#toast");

  toast.textContent = text;
  toast.classList.toggle("error", kind === "error");
  toast.classList.add("show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function confirmDialog(text) {
  const dialog = $("#confirm-dialog");

  $("#confirm-text").textContent = text;

  return new Promise((resolve) => {
    dialog.returnValue = "cancel";

    const onClose = () => {
      dialog.removeEventListener("close", onClose);
      resolve(dialog.returnValue === "ok");
    };

    dialog.addEventListener("close", onClose);
    dialog.showModal();
  });
}

$("#confirm-ok").addEventListener("click", () => $("#confirm-dialog").close("ok"));
$("#confirm-cancel").addEventListener("click", () => $("#confirm-dialog").close("cancel"));

// ==========================================
// 3. TEMA TERANG / GELAP
// ==========================================
const THEME_KEY = "theme-pref";
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

function getThemePref() {
  try {
    return localStorage.getItem(THEME_KEY) || "system";
  } catch {
    return "system";
  }
}

function isDarkTheme() {
  return document.documentElement.dataset.theme === "dark";
}

function applyTheme(pref) {
  const dark = pref === "dark" || (pref === "system" && systemDark.matches);

  document.documentElement.dataset.theme = dark ? "dark" : "light";
  $('meta[name="theme-color"]').setAttribute("content", dark ? "#18297e" : "#2b4fd9");
  $("#theme-icon").innerHTML = icon(dark ? "sun" : "moon", 20);
  $("#theme-select").value = pref;
}

function setThemePref(pref) {
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    // Penyimpanan diblokir: tema tetap berlaku selama halaman terbuka
  }

  applyTheme(pref);
}

$("#theme-toggle").addEventListener("click", () => {
  setThemePref(isDarkTheme() ? "light" : "dark");
});

$("#theme-select").addEventListener("change", (event) => {
  setThemePref(event.target.value);
});

systemDark.addEventListener("change", () => {
  if (getThemePref() === "system") applyTheme("system");
});

// ==========================================
// 4. GANTI MODE LOGIN DAN DAFTAR
// ==========================================
function setAuthMode(signUpMode) {
  isSignUp = signUpMode;

  authTitle.textContent = isSignUp ? "Daftar" : "Masuk";
  authSubmit.textContent = isSignUp ? "Buat Akun" : "Masuk";

  authToggle.textContent = isSignUp
    ? "Sudah punya akun? Masuk"
    : "Belum punya akun? Daftar";

  authPassword.autocomplete = isSignUp
    ? "new-password"
    : "current-password";
}

authToggle.addEventListener("click", () => {
  setAuthMode(!isSignUp);

  authMessage.textContent = "";
  resendConfirmationButton.hidden = true;
});

// ==========================================
// 5. REGISTRASI DAN LOGIN SUPABASE
// ==========================================
authForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!isSupabaseConfigured) {
    authMessage.textContent =
      "Konfigurasi Supabase belum lengkap. Periksa supabase-config.js.";
    return;
  }

  const email = authEmail.value.trim();
  const password = authPassword.value;

  if (!email || !password) {
    authMessage.textContent = "Email dan password wajib diisi.";
    return;
  }

  authSubmit.disabled = true;
  authMessage.textContent = "";
  resendConfirmationButton.hidden = true;

  try {
    if (isSignUp) {
      // Tandai sedang daftar supaya onAuthStateChange tidak membuka dashboard
      isRegistering = true;

      const { error } = await supabase.auth.signUp({
        email,
        password
      });

      if (error) {
        throw error;
      }

      // Hapus sesi otomatis dari signUp supaya tidak langsung masuk dashboard
      await supabase.auth.signOut();

      // Kembalikan form ke mode Masuk
      setAuthMode(false);
      authForm.reset();

      // Pastikan yang tampil adalah halaman login
      authSection.hidden = false;
      appSection.hidden = true;

      authMessage.textContent =
        "Pendaftaran berhasil. Silakan masuk dengan akun Anda.";
    } else {
      const { data, error } =
        await supabase.auth.signInWithPassword({
          email,
          password
        });

      if (error) {
        throw error;
      }

      if (!data.session) {
        throw new Error(
          "Sesi login tidak ditemukan. Silakan coba login kembali."
        );
      }

      authMessage.textContent = "Login berhasil.";
      await updateSession(data.session);
      authForm.reset();
    }
  } catch (error) {
    if (error.code === "email_not_confirmed") {
      authMessage.textContent =
        "Email belum dikonfirmasi. Periksa pengaturan konfirmasi email Supabase.";
      resendConfirmationButton.hidden = false;
    } else if (error.message?.toLowerCase().includes("rate limit")) {
      authMessage.textContent =
        "Terlalu banyak percobaan. Tunggu beberapa saat sebelum mencoba lagi.";
    } else {
      authMessage.textContent =
        `Autentikasi gagal: ${getErrorMessage(error)}`;
    }
  } finally {
    isRegistering = false;
    authSubmit.disabled = false;
  }
});

// ==========================================
// 6. KIRIM ULANG EMAIL KONFIRMASI
// ==========================================
resendConfirmationButton.addEventListener("click", async () => {
  const email = authEmail.value.trim();

  if (!email) {
    authMessage.textContent = "Masukkan email akun terlebih dahulu.";
    return;
  }

  resendConfirmationButton.disabled = true;
  authMessage.textContent = "";

  try {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email
    });

    if (error) {
      throw error;
    }

    authMessage.textContent =
      "Permintaan berhasil. Periksa email jika konfirmasi diperlukan.";
  } catch (error) {
    authMessage.textContent =
      `Gagal mengirim email: ${getErrorMessage(error)}`;
  } finally {
    resendConfirmationButton.disabled = false;
  }
});

// ==========================================
// 7. LOGOUT
// ==========================================
signOutButton.addEventListener("click", async () => {
  signOutButton.disabled = true;

  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      throw error;
    }

    authMessage.textContent = "Berhasil keluar dari akun.";
  } catch (error) {
    showToast(`Gagal keluar: ${getErrorMessage(error)}`, "error");
  } finally {
    signOutButton.disabled = false;
  }
});

// ==========================================
// 8. DATA PENGGUNA DAN PROFIL
// ==========================================
// Nama tampilan dan anggaran bulanan disimpan di user_metadata Supabase Auth,
// jadi ikut tersinkron antarperangkat tanpa tabel tambahan.
const userName = () =>
  String(state.user?.user_metadata?.full_name ?? "").trim() ||
  nameFromEmail(state.user?.email);

const userBudget = () => Number(state.user?.user_metadata?.monthly_budget) || 0;

function refreshProfile() {
  const email = state.user?.email || "";

  $("#avatar").textContent = initialOf(userName());
  $("#profile-name").textContent = userName();
  $("#user-email").textContent = email;
  $("#settings-email").textContent = email;
}

async function requireUser() {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  if (!data.user) {
    throw new Error("Sesi login tidak ditemukan. Silakan login kembali.");
  }

  return data.user;
}

// ==========================================
// 9. MEMUAT TRANSAKSI MILIK PENGGUNA
// ==========================================
// Supabase membatasi satu permintaan sampai 1000 baris, jadi data diambil
// per halaman. Tanpa ini, saldo dan akumulasi bisa salah untuk data besar.
const PAGE_SIZE = 1000;

async function loadTransactions() {
  try {
    const user = state.user;

    if (!user) {
      state.transactions = [];
      return false;
    }

    const all = [];
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from("transactions")
        .select(
          "id, user_id, type, amount, category, transaction_date, description, created_at"
        )
        .eq("user_id", user.id)
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        throw error;
      }

      all.push(...(data || []));

      if (!data || data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    state.transactions = all;
    return true;
  } catch (error) {
    showToast(`Gagal memuat transaksi: ${getErrorMessage(error)}`, "error");
    return false;
  }
}

const savingsBalance = (list = state.transactions) => totals(list).netSaving;

// ==========================================
// 10. KOMPONEN TAMPILAN BERSAMA
// ==========================================
function statTile({ label, value, sub, tone }) {
  return el(
    "div",
    { class: `stat ${tone ?? ""}`.trim() },
    el("small", {}, label),
    el("strong", {}, value),
    sub ? el("span", { class: "sub" }, sub) : null
  );
}

function transactionItem(item, { showDate = false, actions = false } = {}) {
  const sign = AMOUNT_SIGN[item.type] ?? "";
  const note = item.description || TYPE_LABEL[item.type];

  const node = el(
    "li",
    { class: "tx" },
    el("span", {
      class: `tx-icon ${item.type}`,
      html: icon(TYPE_ICON[item.type] ?? "wallet", 20)
    }),
    el(
      "div",
      { class: "tx-body" },
      el("strong", {}, item.category),
      el("small", {}, showDate ? `${formatDateShort(item.transaction_date)}, ${note}` : note)
    ),
    el("div", { class: `tx-amount ${item.type}` }, `${sign}${rupiah(Number(item.amount))}`)
  );

  if (actions) {
    node.append(
      el(
        "div",
        { class: "tx-actions" },
        el("button", {
          type: "button",
          class: "icon-btn",
          "aria-label": `Ubah transaksi ${item.category}`,
          html: icon("edit", 18),
          onClick: () => startEdit(item.id)
        }),
        el("button", {
          type: "button",
          class: "icon-btn delete",
          "aria-label": `Hapus transaksi ${item.category}`,
          html: icon("trash", 18),
          onClick: () => deleteTransaction(item)
        })
      )
    );
  }

  return node;
}

function emptyMessage(text) {
  return el("p", { class: "empty" }, text);
}

function dailyChartData(monthKey) {
  return dailyAccumulation(state.transactions, monthKey, { includeEmpty: true }).rows.map(
    (row) => ({
      label: String(row.day),
      income: row.income,
      expense: row.expense,
      title: formatDateLong(row.date)
    })
  );
}

// Label bulan: di beranda ditulis "Bulan Ini" bila bulan yang dipilih = bulan berjalan
function updateNavLabels() {
  const isCurrent = state.month === currentMonthKey();

  $$("[data-month-label]").forEach((node) => {
    node.textContent =
      node.dataset.monthLabel === "relative" && isCurrent
        ? "Bulan Ini"
        : monthLabel(state.month);
  });

  $$("[data-year-label]").forEach((node) => {
    node.textContent = `Tahun ${state.month.slice(0, 4)}`;
  });
}

// ==========================================
// 11. BERANDA / DASHBOARD
// ==========================================
function renderHome() {
  const all = totals(state.transactions);
  const monthItems = state.transactions.filter(
    (item) => item.transaction_date.slice(0, 7) === state.month
  );
  const month = totals(monthItems);

  $("#balance").textContent = rupiah(all.balance);
  $("#income").textContent = rupiah(all.income);
  $("#expense-total").textContent = rupiah(all.expense);
  $("#savings-total").textContent = rupiah(all.netSaving);

  $("#greeting").textContent = `${greetingFor()}, ${userName()}`;
  $("#today-label").textContent = formatDateLong(todayString());

  $("#month-income").textContent = rupiah(month.income);
  $("#month-expense").textContent = rupiah(month.expense);
  $("#month-saving").textContent = rupiah(month.netSaving);

  renderBudgetCard(month.expense);

  renderBarChart($("#home-chart"), dailyChartData(state.month), {
    height: 170,
    labelEvery: "auto",
    emptyText: "Belum ada transaksi pada bulan ini."
  });

  const recent = $("#recent-list");
  recent.replaceChildren();

  if (state.transactions.length === 0) {
    recent.append(
      el("li", {}, emptyMessage("Belum ada transaksi. Ketuk tombol + untuk mencatat yang pertama."))
    );
  } else {
    state.transactions
      .slice(0, 5)
      .forEach((item) => recent.append(transactionItem(item, { showDate: true })));
  }
}

function renderBudgetCard(spent) {
  const budget = userBudget();
  const status = budgetStatus(spent, budget);
  const progress = $("#budget-progress");

  if (!status) {
    $("#budget-text").textContent = "Belum diatur";
    $("#budget-sub").textContent = "Batasi pengeluaran bulanan Anda.";
    $("#budget-link").textContent = "Atur anggaran";
    progress.hidden = true;
    return;
  }

  const left = status.remaining >= 0;
  const percent = Math.round(status.pct);

  $("#budget-text").textContent = left
    ? rupiah(status.remaining)
    : `Lebih ${rupiah(-status.remaining)}`;
  $("#budget-sub").textContent = left
    ? `sisa dari ${rupiah(budget)}, ${percent}% terpakai`
    : `dari anggaran ${rupiah(budget)}`;
  $("#budget-link").textContent = "Ubah anggaran";

  progress.hidden = false;
  progress.className = `progress ${status.level === "ok" ? "" : status.level}`.trim();
  $("#budget-bar").style.width = `${Math.min(status.pct, 100)}%`;
}

// ==========================================
// 12. FORM TRANSAKSI (TAMBAH DAN UBAH)
// ==========================================
function setFormType(type) {
  state.formType = type;
  $("#type").value = type;

  $$("#type-switch button").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.type === type));
  });

  $("#category").placeholder = CATEGORY_PLACEHOLDER[type];

  const chips = $("#category-chips");
  chips.replaceChildren(
    ...CATEGORY_SUGGESTIONS[type].map((name) =>
      el(
        "button",
        {
          type: "button",
          onClick: () => {
            $("#category").value = name;
            $("#amount").focus();
          }
        },
        name
      )
    )
  );

  updateFormHint();
}

function updateFormHint() {
  const type = state.formType;
  const base = state.transactions.filter((item) => item.id !== state.editingId);
  const summary = totals(base);
  let text = "";

  if (type === "expense") {
    text = `Saldo saat ini ${rupiah(summary.balance)}.`;
  } else if (type === "saving") {
    text = `Saldo tersedia ${rupiah(summary.balance)}. Uang yang ditabung keluar dari saldo dan masuk ke total tabungan.`;
  } else if (type === "withdraw") {
    text = `Tabungan tersedia ${rupiah(summary.netSaving)}. Uang yang ditarik kembali masuk ke saldo.`;
  }

  $("#form-hint").textContent = text;
}

function resetFormFields({ keepDate = false } = {}) {
  $("#amount").value = "";
  $("#category").value = "";
  $("#description").value = "";
  $("#amount-preview").textContent = "";

  if (!keepDate) $("#date").value = todayString();
}

function renderForm() {
  const editing = state.transactions.find((item) => item.id === state.editingId) ?? null;

  if (state.editingId && !editing) state.editingId = null;

  message.textContent = "";
  $("#form-title").textContent = editing ? "Ubah Transaksi" : "Form Pencatatan Transaksi";
  $("#form-submit").textContent = editing ? "Simpan Perubahan" : "Simpan Transaksi";
  $("#form-cancel").hidden = !editing;

  if (editing) {
    $("#amount").value = Number(editing.amount);
    $("#category").value = editing.category;
    $("#date").value = editing.transaction_date;
    $("#description").value = editing.description ?? "";
    $("#amount-preview").textContent = rupiah(Number(editing.amount));
  } else {
    resetFormFields();
  }

  setFormType(editing ? editing.type : state.formType);
}

function startEdit(id) {
  const item = state.transactions.find((entry) => entry.id === id);
  if (!item) return;

  state.editingId = id;
  state.formType = item.type;
  navigate("add");
}

$("#type-switch").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-type]");
  if (!button) return;

  message.textContent = "";
  setFormType(button.dataset.type);
});

$("#amount").addEventListener("input", (event) => {
  const value = Number(event.target.value);
  $("#amount-preview").textContent = value > 0 ? rupiah(value) : "";
});

$("#form-cancel").addEventListener("click", () => {
  state.editingId = null;
  navigate("history");
});

// ==========================================
// 13. MENYIMPAN TRANSAKSI KE SUPABASE
// ==========================================
form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const editingId = state.editingId;
  const others = state.transactions.filter((item) => item.id !== editingId);

  const result = validateTransaction(
    {
      type: $("#type").value,
      amountText: $("#amount").value,
      category: $("#category").value,
      date: $("#date").value,
      description: $("#description").value
    },
    { savingsAvailable: savingsBalance(others) }
  );

  if (!result.ok) {
    message.textContent = result.error;
    return;
  }

  // Mengubah tabungan lama tidak boleh membuat total tabungan negatif
  if (editingId) {
    const edited = state.transactions.map((item) =>
      item.id === editingId ? { ...item, ...result.value } : item
    );

    if (savingsBalance(edited) < 0) {
      message.textContent =
        "Perubahan ditolak karena total tabungan akan menjadi negatif akibat penarikan yang sudah tercatat.";
      return;
    }
  }

  const submitButton = $("#form-submit");

  submitButton.disabled = true;
  message.textContent = "Menyimpan transaksi...";

  try {
    // Pastikan ada pengguna yang benar-benar login
    const user = await requireUser();

    if (editingId) {
      const { error } = await supabase
        .from("transactions")
        .update(result.value)
        .eq("id", editingId)
        .eq("user_id", user.id);

      if (error) {
        throw error;
      }
    } else {
      // PENTING: user_id harus sesuai dengan ID pengguna Supabase
      const { error } = await supabase.from("transactions").insert({
        user_id: user.id,
        ...result.value
      });

      if (error) {
        throw error;
      }
    }

    await loadTransactions();

    if (editingId) {
      state.editingId = null;
      showToast("Perubahan transaksi disimpan.");
      navigate("history");
    } else {
      resetFormFields({ keepDate: true });
      updateFormHint();
      message.textContent = "Transaksi berhasil disimpan.";
      showToast("Transaksi berhasil disimpan.");
      updateBell();
    }
  } catch (error) {
    message.textContent =
      `Gagal menyimpan transaksi: ${getErrorMessage(error)}`;
  } finally {
    submitButton.disabled = false;
  }
});

// ==========================================
// 14. MENGHAPUS TRANSAKSI
// ==========================================
async function deleteTransaction(item) {
  const remaining = state.transactions.filter((entry) => entry.id !== item.id);

  if (savingsBalance(remaining) < 0) {
    showToast(
      "Tidak bisa dihapus: total tabungan akan menjadi negatif karena sudah ada penarikan.",
      "error"
    );
    return;
  }

  const confirmed = await confirmDialog(
    `${TYPE_LABEL[item.type]} ${item.category} sebesar ${rupiah(Number(item.amount))} ` +
      `pada ${formatDateShort(item.transaction_date)} akan dihapus permanen.`
  );

  if (!confirmed) return;

  try {
    const user = await requireUser();

    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", item.id)
      .eq("user_id", user.id);

    if (error) {
      throw error;
    }

    await loadTransactions();
    refreshCurrentView();
    showToast("Transaksi dihapus.");
  } catch (error) {
    showToast(`Gagal menghapus transaksi: ${getErrorMessage(error)}`, "error");
  }
}

// ==========================================
// 15. RIWAYAT TRANSAKSI
// ==========================================
function renderHistory() {
  const select = $("#history-month");
  const months = monthsWithData(state.transactions, currentMonthKey());

  // Bulan yang dipilih tidak boleh hilang dari daftar
  if (state.history.month !== "all" && !months.includes(state.history.month)) {
    state.history.month = "all";
  }

  select.replaceChildren(
    el("option", { value: "all" }, "Semua bulan"),
    ...months.map((key) => el("option", { value: key }, monthLabel(key)))
  );
  select.value = state.history.month;

  $("#history-type").value = state.history.type;
  $("#history-search").value = state.history.query;

  renderHistoryList();
}

function renderHistoryList() {
  const container = $("#transaction-list");
  const list = filterTransactions(state.transactions, {
    month: state.history.month,
    type: state.history.type,
    query: state.history.query
  });

  container.replaceChildren();

  // Batasi jumlah per tampilan; tanggal tidak dipotong di tengah
  const groups = groupByDate(list);
  const visible = [];
  let count = 0;

  for (const group of groups) {
    if (count >= state.history.limit) break;
    visible.push(group);
    count += group.items.length;
  }

  const sum = totals(list);
  $("#history-summary").textContent = list.length
    ? `${list.length} transaksi. Pemasukan ${rupiah(sum.income)}, pengeluaran ${rupiah(sum.expense)}.`
    : "";

  if (list.length === 0) {
    const filtered =
      state.history.month !== "all" || state.history.type !== "all" || state.history.query.trim();

    container.append(
      emptyMessage(
        filtered
          ? "Tidak ada transaksi yang cocok dengan filter."
          : "Belum ada transaksi. Ketuk tombol + untuk mencatat yang pertama."
      )
    );
  }

  visible.forEach((group) => {
    const parts = [];
    if (group.totals.income > 0) parts.push(`+${rupiah(group.totals.income)}`);
    if (group.totals.expense > 0) parts.push(`-${rupiah(group.totals.expense)}`);

    container.append(
      el(
        "section",
        { class: "day-group" },
        el(
          "div",
          { class: "day-head" },
          el("strong", {}, formatDateLong(group.date)),
          el("small", {}, parts.join("   "))
        ),
        el(
          "ul",
          { class: "tx-list" },
          group.items.map((item) => transactionItem(item, { actions: true }))
        )
      )
    );
  });

  $("#history-more").hidden = count >= list.length;
}

$("#history-month").addEventListener("change", (event) => {
  state.history.month = event.target.value;
  state.history.limit = 100;
  renderHistoryList();
});

$("#history-type").addEventListener("change", (event) => {
  state.history.type = event.target.value;
  state.history.limit = 100;
  renderHistoryList();
});

$("#history-search").addEventListener(
  "input",
  debounce((event) => {
    state.history.query = event.target.value;
    state.history.limit = 100;
    renderHistoryList();
  }, 150)
);

$("#history-more").addEventListener("click", () => {
  state.history.limit += 100;
  renderHistoryList();
});

// ==========================================
// 16. AKUMULASI PER TANGGAL DAN PER BULAN
// ==========================================
const moneyCell = (value, tone) =>
  el("td", { class: value === 0 ? "" : (tone ?? "") }, value === 0 ? "-" : angka(value));

const closingCell = (value) =>
  el("td", { class: `closing ${value < 0 ? "minus" : ""}`.trim() }, angka(value));

function accumulationHead(firstLabel) {
  return el(
    "thead",
    {},
    el(
      "tr",
      {},
      [firstLabel, "Masuk", "Keluar", "Tabung", "Saldo"].map((text) =>
        el("th", { scope: "col" }, text)
      )
    )
  );
}

function accumulationFooter(sum, closing) {
  return el(
    "tfoot",
    {},
    el(
      "tr",
      {},
      el("td", {}, "Total"),
      moneyCell(sum.income, "pos"),
      moneyCell(sum.expense, "neg"),
      moneyCell(sum.netSaving, "sav"),
      closingCell(closing)
    )
  );
}

function detailRow(items) {
  return el(
    "tr",
    { class: "detail" },
    el(
      "td",
      { colspan: "5" },
      el(
        "ul",
        {},
        items.map((item) =>
          el(
            "li",
            {},
            el(
              "span",
              {},
              item.description ? `${item.category}: ${item.description}` : item.category
            ),
            el(
              "strong",
              { class: `tx-amount ${item.type}` },
              `${AMOUNT_SIGN[item.type]}${rupiah(Number(item.amount))}`
            )
          )
        )
      )
    )
  );
}

function renderDailyAccumulation() {
  const acc = dailyAccumulation(state.transactions, state.month, {
    includeEmpty: state.showAllDays
  });

  $("#show-all-days").checked = state.showAllDays;

  $("#daily-summary").replaceChildren(
    statTile({ label: "Saldo awal bulan", value: rupiah(acc.opening) }),
    statTile({ label: "Pemasukan", value: rupiah(acc.totals.income), tone: "income" }),
    statTile({ label: "Pengeluaran", value: rupiah(acc.totals.expense), tone: "expense" }),
    statTile({ label: "Tabungan bersih", value: rupiah(acc.totals.netSaving), tone: "saving" }),
    statTile({
      label: "Saldo akhir bulan",
      value: rupiah(acc.closing),
      sub: `${acc.activeDays} dari ${acc.daysInMonth} hari ada transaksi`,
      tone: "primary"
    })
  );

  const body = el(
    "tbody",
    {},
    el(
      "tr",
      { class: "opening" },
      el("td", {}, "Saldo awal"),
      el("td"),
      el("td"),
      el("td"),
      el("td", {}, angka(acc.opening))
    )
  );

  if (acc.rows.length === 0) {
    body.append(
      el(
        "tr",
        {},
        el("td", { colspan: "5", class: "empty" }, "Belum ada transaksi pada bulan ini.")
      )
    );
  }

  acc.rows.forEach((row) => {
    const label =
      row.count > 0
        ? el(
            "button",
            {
              type: "button",
              class: "row-toggle",
              "aria-expanded": "false",
              "aria-label": `Rincian transaksi ${formatDateLong(row.date)}`
            },
            String(row.day),
            el("small", {}, weekdayShort(row.date))
          )
        : el("span", {}, `${row.day} `, el("small", {}, weekdayShort(row.date)));

    const tr = el(
      "tr",
      { class: row.count === 0 ? "zero" : "" },
      el("td", {}, label),
      moneyCell(row.income, "pos"),
      moneyCell(row.expense, "neg"),
      moneyCell(row.netSaving, "sav"),
      closingCell(row.closing)
    );

    if (row.count > 0) {
      const toggle = $("button", tr);

      toggle.addEventListener("click", () => {
        const next = tr.nextElementSibling;

        if (next?.classList.contains("detail")) {
          next.remove();
          toggle.setAttribute("aria-expanded", "false");
        } else {
          tr.after(detailRow(row.items));
          toggle.setAttribute("aria-expanded", "true");
        }
      });
    }

    body.append(tr);
  });

  $("#daily-table").replaceChildren(
    accumulationHead("Tanggal"),
    body,
    accumulationFooter(acc.totals, acc.closing)
  );
}

function renderMonthlyAccumulation() {
  const year = Number(state.month.slice(0, 4));
  const acc = monthlyAccumulation(state.transactions, year);

  $("#monthly-summary").replaceChildren(
    statTile({ label: "Saldo awal tahun", value: rupiah(acc.opening) }),
    statTile({ label: "Pemasukan", value: rupiah(acc.totals.income), tone: "income" }),
    statTile({ label: "Pengeluaran", value: rupiah(acc.totals.expense), tone: "expense" }),
    statTile({ label: "Tabungan bersih", value: rupiah(acc.totals.netSaving), tone: "saving" }),
    statTile({ label: "Saldo akhir tahun", value: rupiah(acc.closing), tone: "primary" })
  );

  const body = el("tbody");

  acc.rows.forEach((row) => {
    const toggle = el(
      "button",
      {
        type: "button",
        class: "row-toggle",
        "aria-label": `Lihat rincian ${monthName(row.month)} ${year}`,
        onClick: () => {
          state.month = row.monthKey;
          state.accumTab = "daily";
          renderAccumulation();
          updateNavLabels();
        }
      },
      monthShortName(row.month)
    );

    body.append(
      el(
        "tr",
        { class: row.count === 0 ? "zero" : "" },
        el("td", {}, toggle),
        moneyCell(row.income, "pos"),
        moneyCell(row.expense, "neg"),
        moneyCell(row.netSaving, "sav"),
        closingCell(row.closing)
      )
    );
  });

  $("#monthly-table").replaceChildren(
    accumulationHead("Bulan"),
    body,
    accumulationFooter(acc.totals, acc.closing)
  );
}

function renderAccumulation() {
  const daily = state.accumTab === "daily";

  $$("[data-accum-tab]").forEach((tab) => {
    tab.setAttribute("aria-selected", String(tab.dataset.accumTab === state.accumTab));
  });

  $("#panel-daily").hidden = !daily;
  $("#panel-monthly").hidden = daily;

  if (daily) renderDailyAccumulation();
  else renderMonthlyAccumulation();
}

$$("[data-accum-tab]").forEach((tab) => {
  tab.addEventListener("click", () => {
    state.accumTab = tab.dataset.accumTab;
    renderAccumulation();
  });
});

$("#show-all-days").addEventListener("change", (event) => {
  state.showAllDays = event.target.checked;
  renderDailyAccumulation();
});

// ==========================================
// 17. AKTIVITAS (GRAFIK DAN WAWASAN)
// ==========================================
function renderActivity() {
  const insight = monthInsights(state.transactions, state.month, todayString());

  $("#insight-grid").replaceChildren(
    statTile({
      label: "Rata-rata pengeluaran per hari",
      value: rupiah(insight.avgDailyExpense),
      tone: "expense"
    }),
    statTile({
      label: "Hari paling boros",
      value: insight.topDay ? formatDateShort(insight.topDay.date) : "-",
      sub: insight.topDay ? rupiah(insight.topDay.total) : "Belum ada pengeluaran"
    }),
    statTile({
      label: "Kategori terbesar",
      value: insight.topCategory ? insight.topCategory.category : "-",
      sub: insight.topCategory
        ? `${rupiah(insight.topCategory.total)} (${insight.topCategory.pct.toFixed(0)}%)`
        : "Belum ada pengeluaran"
    }),
    statTile({
      label: "Rasio menabung",
      value: insight.savingRate === null ? "-" : `${insight.savingRate.toFixed(0)}%`,
      sub: insight.savingRate === null ? "Belum ada pemasukan" : "dari pemasukan bulan ini",
      tone: "saving"
    })
  );

  renderBarChart($("#activity-daily-chart"), dailyChartData(state.month), {
    height: 220,
    labelEvery: "auto",
    emptyText: "Belum ada transaksi pada bulan ini."
  });

  renderCategoryList(
    $("#category-list"),
    categoryBreakdown(state.transactions, state.month, "expense")
  );

  const year = Number(state.month.slice(0, 4));
  $("#trend-year").textContent = String(year);

  renderBarChart(
    $("#activity-monthly-chart"),
    monthlyAccumulation(state.transactions, year).rows.map((row) => ({
      label: monthShortName(row.month),
      income: row.income,
      expense: row.expense,
      title: `${monthName(row.month)} ${year}`
    })),
    {
      height: 220,
      labelEvery: "auto",
      labelWidth: 22,
      emptyText: `Belum ada transaksi pada tahun ${year}.`
    }
  );
}

// ==========================================
// 18. CETAK LAPORAN (WORD, CSV, PDF)
// ==========================================
function currentReport() {
  return buildReport({
    userName: userName(),
    email: state.user?.email || "",
    scope: state.reportScope,
    monthKey: state.month,
    transactions: state.transactions
  });
}

function renderReport() {
  const yearScope = state.reportScope === "year";
  const year = Number(state.month.slice(0, 4));
  const prefix = yearScope ? String(year) : state.month;

  $$("[data-report-scope]").forEach((tab) => {
    tab.setAttribute("aria-selected", String(tab.dataset.reportScope === state.reportScope));
  });

  $("#report-month-nav").hidden = yearScope;
  $("#report-year-nav").hidden = !yearScope;

  const acc = yearScope
    ? monthlyAccumulation(state.transactions, year)
    : dailyAccumulation(state.transactions, state.month);
  const count = state.transactions.filter((item) =>
    item.transaction_date.startsWith(prefix)
  ).length;

  $("#report-summary").replaceChildren(
    statTile({ label: "Saldo awal periode", value: rupiah(acc.opening) }),
    statTile({ label: "Pemasukan", value: rupiah(acc.totals.income), tone: "income" }),
    statTile({ label: "Pengeluaran", value: rupiah(acc.totals.expense), tone: "expense" }),
    statTile({ label: "Tabungan bersih", value: rupiah(acc.totals.netSaving), tone: "saving" }),
    statTile({
      label: "Saldo akhir periode",
      value: rupiah(acc.closing),
      sub: `${count} transaksi`,
      tone: "primary"
    })
  );

  $("#report-hint").textContent =
    count > 0
      ? "Laporan berisi ringkasan, akumulasi, pengeluaran per kategori, dan rincian transaksi."
      : "Belum ada transaksi pada periode ini, jadi tidak ada yang bisa diunduh.";

  ["#export-word", "#export-csv", "#export-print"].forEach((selector) => {
    $(selector).disabled = count === 0;
  });
}

$$("[data-report-scope]").forEach((tab) => {
  tab.addEventListener("click", () => {
    state.reportScope = tab.dataset.reportScope;
    renderReport();
  });
});

$("#export-word").addEventListener("click", () => {
  const report = currentReport();

  downloadFile(`${report.filenameBase}.doc`, "application/msword", buildWordDocument(report));
  showToast("Dokumen Word diunduh.");
});

$("#export-csv").addEventListener("click", () => {
  const report = currentReport();

  downloadFile(`${report.filenameBase}.csv`, "text/csv", buildCsv(report.transactions));
  showToast("Berkas CSV diunduh.");
});

$("#export-print").addEventListener("click", () => {
  const report = currentReport();
  const area = $("#print-area");
  const previousTitle = document.title;

  // Judul dokumen menjadi nama berkas bawaan saat menyimpan sebagai PDF
  area.innerHTML = `<style>${report.css}</style>${report.body}`;
  document.title = report.filenameBase;

  window.addEventListener(
    "afterprint",
    () => {
      area.replaceChildren();
      document.title = previousTitle;
    },
    { once: true }
  );

  window.print();
});

// ==========================================
// 19. PENGATURAN
// ==========================================
function renderSettings() {
  const metaName = String(state.user?.user_metadata?.full_name ?? "").trim();

  $("#display-name").value = metaName;
  $("#display-name").placeholder = nameFromEmail(state.user?.email);
  $("#monthly-budget").value = userBudget() || "";
  $("#theme-select").value = getThemePref();
  $("#profile-message").textContent = "";
}

$("#profile-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const profileMessage = $("#profile-message");
  const budget = parseBudget($("#monthly-budget").value);

  if (!budget.ok) {
    profileMessage.textContent = budget.error;
    return;
  }

  const submitButton = $("#profile-submit");

  submitButton.disabled = true;
  profileMessage.textContent = "Menyimpan pengaturan...";

  try {
    const { data, error } = await supabase.auth.updateUser({
      data: {
        full_name: $("#display-name").value.trim(),
        monthly_budget: budget.value
      }
    });

    if (error) {
      throw error;
    }

    state.user = data.user;
    refreshProfile();
    profileMessage.textContent = "Pengaturan disimpan.";
    showToast("Pengaturan disimpan.");
  } catch (error) {
    profileMessage.textContent = `Gagal menyimpan pengaturan: ${getErrorMessage(error)}`;
  } finally {
    submitButton.disabled = false;
  }
});

// ==========================================
// 20. NOTIFIKASI
// ==========================================
function buildNotifications() {
  const list = [];
  const thisMonth = currentMonthKey();
  const today = todayString();
  const monthExpense = totals(
    state.transactions.filter((item) => item.transaction_date.slice(0, 7) === thisMonth)
  ).expense;
  const status = budgetStatus(monthExpense, userBudget());

  if (status?.level === "over") {
    list.push({
      level: "bad",
      icon: "alert",
      text: `Pengeluaran bulan ini melebihi anggaran sebesar ${rupiah(-status.remaining)}.`
    });
  } else if (status?.level === "warn") {
    list.push({
      level: "warn",
      icon: "alert",
      text: `Pengeluaran bulan ini sudah ${Math.round(status.pct)}% dari anggaran. Sisa ${rupiah(status.remaining)}.`
    });
  }

  if (totals(state.transactions).balance < 0) {
    list.push({
      level: "bad",
      icon: "alert",
      text: "Saldo saat ini negatif. Periksa kembali catatan pemasukan dan pengeluaran."
    });
  }

  if (!state.transactions.some((item) => item.transaction_date === today)) {
    list.push({
      level: "info",
      icon: "info",
      text: "Belum ada transaksi tercatat hari ini."
    });
  }

  return list;
}

function updateBell() {
  $("#bell-dot").hidden = !buildNotifications().some((item) => item.level !== "info");
}

$("#bell-btn").addEventListener("click", () => {
  const items = buildNotifications();
  const list = $("#notif-list");

  list.replaceChildren(
    ...(items.length
      ? items.map((item) =>
          el(
            "li",
            { class: item.level },
            el("span", { html: icon(item.icon, 20) }),
            el("span", {}, item.text)
          )
        )
      : [el("li", {}, el("span", { html: icon("check", 20) }), el("span", {}, "Tidak ada notifikasi baru."))])
  );

  $("#notif-dialog").showModal();
});

$("#notif-close").addEventListener("click", () => $("#notif-dialog").close());

// ==========================================
// 21. NAVIGASI ANTAR HALAMAN
// ==========================================
const RENDERERS = {
  home: renderHome,
  add: renderForm,
  history: renderHistory,
  accumulation: renderAccumulation,
  activity: renderActivity,
  report: renderReport,
  settings: renderSettings
};

function showView(name) {
  const changed = state.view !== name;

  state.view = name;

  $$(".view").forEach((section) => {
    section.hidden = section.id !== `view-${name}`;
  });

  $$("[data-nav]").forEach((button) => {
    const active = button.dataset.nav === name;

    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });

  updateNavLabels();
  updateBell();
  RENDERERS[name]();

  if (changed) {
    window.scrollTo(0, 0);
    if (name !== "home") $(`#view-${name} h2`)?.focus({ preventScroll: true });
  }
}

function navigate(name) {
  const target = `#/${name}`;

  if (location.hash === target) showView(name);
  else location.hash = target; // hashchange -> routeFromHash -> showView
}

function routeFromHash() {
  if (!state.user) return;

  const name = location.hash.replace(/^#\//, "") || "home";
  showView(VIEW_NAMES.includes(name) ? name : "home");
}

// Memuat ulang tampilan aktif setelah data berubah.
// Form tidak dirender ulang agar isian yang sedang diketik tidak hilang.
function refreshCurrentView() {
  if (!state.user) return;

  updateNavLabels();
  updateBell();

  if (state.view === "add") {
    updateFormHint();
    return;
  }

  RENDERERS[state.view]();
}

window.addEventListener("hashchange", routeFromHash);

document.addEventListener("click", (event) => {
  // Tombol dengan atribut data-go berpindah halaman
  const goTarget = event.target.closest("[data-go]");

  if (goTarget) {
    const view = goTarget.dataset.go;

    if (view === "add") {
      state.editingId = null;
      if (goTarget.dataset.type) state.formType = goTarget.dataset.type;
    }

    navigate(view);
    return;
  }

  // Tombol panah bulan / tahun
  const stepButton = event.target.closest("[data-step]");
  const nav = stepButton?.closest("[data-month-nav], [data-year-nav]");

  if (stepButton && nav) {
    const step = Number(stepButton.dataset.step);
    const months = nav.hasAttribute("data-year-nav") ? step * 12 : step;

    state.month = shiftMonth(state.month, months);
    refreshCurrentView();
  }
});

$("#fab-add").addEventListener("click", () => {
  state.editingId = null;
  navigate("add");
});

let lastWidth = window.innerWidth;

window.addEventListener(
  "resize",
  debounce(() => {
    // Grafik hanya digambar ulang bila lebar layar berubah
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;

    if (state.view === "home" || state.view === "activity") refreshCurrentView();
  }, 200)
);

// ==========================================
// 22. MENGATUR TAMPILAN SESUAI STATUS LOGIN
// ==========================================
let lastLoadAt = 0;

async function updateSession(session) {
  if (!session) {
    state.user = null;
    state.transactions = [];
    state.editingId = null;
    state.month = currentMonthKey();

    authSection.hidden = false;
    appSection.hidden = true;
    history.replaceState(null, "", location.pathname + location.search);

    return;
  }

  const sameUser = state.user?.id === session.user.id;

  state.user = session.user;

  authSection.hidden = true;
  appSection.hidden = false;
  refreshProfile();

  // Sesi yang sama dan baru saja dimuat tidak perlu diambil ulang
  if (sameUser && Date.now() - lastLoadAt < 2000) return;

  // Sembunyikan isi halaman sampai data siap supaya tidak muncul "Rp0" sesaat
  if (!sameUser) appSection.classList.add("loading");

  await loadTransactions();
  lastLoadAt = Date.now();
  appSection.classList.remove("loading");

  if (sameUser) refreshCurrentView();
  else routeFromHash();
}

// ==========================================
// 23. INISIALISASI APLIKASI
// ==========================================
async function initialize() {
  hydrateIcons();
  applyTheme(getThemePref());
  setFormType(state.formType);

  if (!isSupabaseConfigured) {
    authMessage.textContent =
      "Lengkapi Project URL dan publishable key di supabase-config.js.";

    authSubmit.disabled = true;
    authToggle.disabled = true;

    return;
  }

  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      throw error;
    }

    await updateSession(data.session);

    supabase.auth.onAuthStateChange((event, session) => {
      // Abaikan sesi sementara yang dibuat otomatis oleh signUp
      if (isRegistering) return;

      // Sesi awal sudah ditangani getSession; token baru tidak mengubah data
      if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") return;

      setTimeout(() => {
        if (event === "USER_UPDATED" && session) {
          state.user = session.user;
          refreshProfile();
          refreshCurrentView();
          return;
        }

        void updateSession(session);
      }, 0);
    });
  } catch (error) {
    authMessage.textContent =
      `Gagal menghubungkan ke Supabase: ${getErrorMessage(error)}`;
  }
}

void initialize();
