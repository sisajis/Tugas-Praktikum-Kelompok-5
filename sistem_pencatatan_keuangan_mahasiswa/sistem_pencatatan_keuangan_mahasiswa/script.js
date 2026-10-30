
import { isSupabaseConfigured, supabase } from "./supabase-config.js";

// ==========================================
// 1. MENGAMBIL ELEMEN HTML
// ==========================================
const authSection = document.querySelector("#auth-section");
const authForm = document.querySelector("#auth-form");
const authTitle = document.querySelector("#auth-title");
const authEmail = document.querySelector("#auth-email");
const authPassword = document.querySelector("#auth-password");
const authSubmit = document.querySelector("#auth-submit");
const authToggle = document.querySelector("#auth-toggle");
const resendConfirmationButton = document.querySelector(
  "#resend-confirmation"
);
const authMessage = document.querySelector("#auth-message");

const appSection = document.querySelector("#app-section");
const userEmail = document.querySelector("#user-email");
const signOutButton = document.querySelector("#sign-out");

const form = document.querySelector("#transaction-form");
const message = document.querySelector("#message");
const transactionList = document.querySelector("#transaction-list");

let isSignUp = false;
let transactions = [];

// ==========================================
// 2. FORMAT RUPIAH
// ==========================================
const rupiah = (value) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(value);

// ==========================================
// 3. PESAN ERROR
// ==========================================
function getErrorMessage(error) {
  return error?.message || "Terjadi kesalahan yang tidak diketahui.";
}

// ==========================================
// 4. GANTI MODE LOGIN DAN DAFTAR
// ==========================================
authToggle.addEventListener("click", () => {
  isSignUp = !isSignUp;

  authTitle.textContent = isSignUp ? "Daftar" : "Masuk";
  authSubmit.textContent = isSignUp ? "Buat Akun" : "Masuk";

  authToggle.textContent = isSignUp
    ? "Sudah punya akun? Masuk"
    : "Belum punya akun? Daftar";

  authPassword.autocomplete = isSignUp
    ? "new-password"
    : "current-password";

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
      const { data, error } = await supabase.auth.signUp({
        email,
        password
      });

      if (error) {
        throw error;
      }

      if (data.session) {
        authMessage.textContent = "Akun berhasil dibuat. Memuat aplikasi...";
        await updateSession(data.session);
      } else {
        authMessage.textContent =
          "Pendaftaran berhasil. Silakan login jika akun sudah dapat digunakan.";
        authForm.reset();
      }
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
  message.textContent = "";

  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      throw error;
    }

    transactions = [];
    transactionList.replaceChildren();
    message.textContent = "Berhasil keluar dari akun.";
  } catch (error) {
    message.textContent = `Gagal keluar: ${getErrorMessage(error)}`;
  } finally {
    signOutButton.disabled = false;
  }
});

// ==========================================
// 8. MENYIMPAN TRANSAKSI KE SUPABASE
// ==========================================
form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const type = document.querySelector("#type").value;
  const amountText = document.querySelector("#amount").value.trim();
  const category = document.querySelector("#category").value.trim();
  const date = document.querySelector("#date").value;
  const description = document.querySelector("#description").value.trim();

  if (!amountText || !category || !date) {
    message.textContent = "Nominal, kategori, dan tanggal wajib diisi.";
    return;
  }

  const amount = Number(amountText);

  if (!Number.isFinite(amount) || amount <= 0) {
    message.textContent = "Nominal harus berupa angka lebih besar dari nol.";
    return;
  }

  // Memvalidasi huruf, angka, spasi, titik, apostrof, dan tanda hubung
  const categoryPattern = /^[\p{L}\p{N}][\p{L}\p{N} .'-]*$/u;

  if (!categoryPattern.test(category)) {
    message.textContent = "Format kategori tidak valid.";
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]');

  if (!submitButton) {
    message.textContent = "Tombol simpan transaksi tidak ditemukan.";
    return;
  }

  submitButton.disabled = true;
  message.textContent = "Menyimpan transaksi...";

  try {
    // Pastikan ada pengguna yang benar-benar login
    const { data: userData, error: userError } =
      await supabase.auth.getUser();

    if (userError) {
      throw userError;
    }

    const user = userData.user;

    if (!user) {
      message.textContent =
        "Sesi login tidak ditemukan. Silakan login kembali.";
      return;
    }

    // PENTING: user_id harus sesuai dengan ID pengguna Supabase
    const { error } = await supabase.from("transactions").insert({
      user_id: user.id,
      type,
      amount,
      category,
      transaction_date: date,
      description: description || null
    });

    if (error) {
      throw error;
    }

    form.reset();
    message.textContent = "Transaksi berhasil disimpan.";

    await loadTransactions();
  } catch (error) {
    message.textContent =
      `Gagal menyimpan transaksi: ${getErrorMessage(error)}`;
  } finally {
    submitButton.disabled = false;
  }
});

// ==========================================
// 9. MEMUAT TRANSAKSI MILIK PENGGUNA
// ==========================================
async function loadTransactions() {
  try {
    const { data: userData, error: userError } =
      await supabase.auth.getUser();

    if (userError) {
      throw userError;
    }

    const user = userData.user;

    if (!user) {
      transactions = [];
      renderTransactions();
      message.textContent = "Silakan login untuk melihat transaksi.";
      return;
    }

    const { data, error } = await supabase
      .from("transactions")
      .select(
        "id, user_id, type, amount, category, transaction_date, description, created_at"
      )
      .eq("user_id", user.id)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    transactions = data || [];
    renderTransactions();
    message.textContent = "";
  } catch (error) {
    message.textContent =
      `Gagal memuat transaksi: ${getErrorMessage(error)}`;
  }
}

// ==========================================
// 10. MENAMPILKAN TRANSAKSI DAN SALDO
// ==========================================
function renderTransactions() {
  transactionList.replaceChildren();

  transactions.forEach((transaction) => {
    const item = document.createElement("li");

    const details = transaction.description
      ? ` — ${transaction.description}`
      : "";

    item.textContent =
      `${transaction.transaction_date} — ${transaction.category} — ` +
      `${transaction.type === "income" ? "Pemasukan" : "Pengeluaran"} ` +
      `${rupiah(Number(transaction.amount))}${details}`;

    transactionList.appendChild(item);
  });

  const income = transactions
    .filter((item) => item.type === "income")
    .reduce((total, item) => total + Number(item.amount), 0);

  const expense = transactions
    .filter((item) => item.type === "expense")
    .reduce((total, item) => total + Number(item.amount), 0);

  document.querySelector("#income").textContent = rupiah(income);
  document.querySelector("#expense-total").textContent = rupiah(expense);
  document.querySelector("#balance").textContent = rupiah(income - expense);
}

// ==========================================
// 11. MENGATUR TAMPILAN SESUAI STATUS LOGIN
// ==========================================
async function updateSession(session) {
  if (!session) {
    transactions = [];
    transactionList.replaceChildren();

    document.querySelector("#income").textContent = rupiah(0);
    document.querySelector("#expense-total").textContent = rupiah(0);
    document.querySelector("#balance").textContent = rupiah(0);

    authSection.hidden = false;
    appSection.hidden = true;
    userEmail.textContent = "";

    return;
  }

  authSection.hidden = true;
  appSection.hidden = false;
  userEmail.textContent = session.user.email || "";

  await loadTransactions();
}

// ==========================================
// 12. INISIALISASI APLIKASI
// ==========================================
async function initialize() {
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

    supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => {
        void updateSession(session);
      }, 0);
    });
  } catch (error) {
    authMessage.textContent =
      `Gagal menghubungkan ke Supabase: ${getErrorMessage(error)}`;
  }
}

void initialize();
