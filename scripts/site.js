const SUPABASE_URL = "https://bjfhmvvupkapplnbrukz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_RxNzh9HL5UPhazJDk6BL9w_aJtZLBAP";
const QUESTION_CACHE_KEY = "dee_perfect_question_cache";
const OUTBOX_CACHE_KEY = "dee_perfect_question_outbox";
const SUPABASE_AUTH_URL = `${SUPABASE_URL}/auth/v1`;
const SUPABASE_REST_URL = `${SUPABASE_URL}/rest/v1`;

var supabaseClient; // var (not let) so it is also available as window.supabaseClient
let supabaseAccessToken = localStorage.getItem("supabase_access_token") || null;
console.log("site.js loaded");


function getSupabaseHeaders(auth = false) {
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    "Content-Type": "application/json",
  };

  if (auth && supabaseAccessToken) {
    headers.Authorization = `Bearer ${supabaseAccessToken}`;
  }

  return headers;
}

async function supabaseRestFetch(path, options = {}) {
  const url = path.startsWith("http") ? path : `${SUPABASE_REST_URL}/${path}`;
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: options.headers || getSupabaseHeaders(options.auth),
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error =
      data?.message || response.statusText || "Supabase REST request failed.";
    throw new Error(error);
  }

  return data;
}

async function supabaseAuthFetch(path, body) {
  const response = await fetch(`${SUPABASE_AUTH_URL}/${path}`, {
    method: "POST",
    headers: getSupabaseHeaders(false),
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error =
      data?.msg ||
      data?.error_description ||
      data?.error ||
      response.statusText;
    throw new Error(error || "Supabase auth request failed.");
  }

  return data;
}

async function supabaseRestSignUp(fullName, email, password, extra = {}) {
  // Role is NOT sent from the browser. The database trigger always creates
  // new accounts as "student" (see supabase/01_schema.sql).
  const data = await supabaseAuthFetch("signup", {
    email,
    password,
    data: { full_name: fullName, ...extra },
  });
  return data.user || data;
}

async function supabaseRestSignIn(email, password) {
  const data = await supabaseAuthFetch("token?grant_type=password", {
    email,
    password,
  });

  if (!data.access_token) {
    throw new Error("Login failed: no access token returned.");
  }

  supabaseAccessToken = data.access_token;
  localStorage.setItem("supabase_access_token", supabaseAccessToken);
  return data.user;
}

async function supabaseRestGetProfileRole(userId) {
  const rows = await supabaseRestFetch(`profiles?id=eq.${userId}&select=role`, {
    auth: true,
  });

  return Array.isArray(rows) && rows[0]?.role ? rows[0].role : null;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.onload = () => {
      console.log(`Loaded script ${src}`);
      resolve();
    };
    script.onerror = () => {
      console.error(`Failed to load script ${src}`);
      reject(new Error(`Failed to load script ${src}`));
    };
    document.head.appendChild(script);
  });
}

async function waitForSupabaseReady(timeoutMs = 2000) {
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    if (window.supabase || typeof window.createClient === "function") {
      return true;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

async function loadSupabaseLocalScript() {
  const localPath = "./scripts/supabase.min.js";
  const existing = document.querySelector(`script[src="${localPath}"]`);
  if (existing) {
    console.log("Found existing local Supabase script element", {
      readyState: existing.readyState,
      src: existing.src,
    });

    if (await waitForSupabaseReady(1500)) {
      console.log("Supabase global appeared from local script.");
      return;
    }

    console.warn(
      "Existing local Supabase script did not initialize quickly; reloading local file.",
    );
    await loadScript(localPath);
    if (!(await waitForSupabaseReady(1500))) {
      throw new Error("Local Supabase script did not initialize.");
    }
    return;
  }

  await loadScript(localPath);
  if (!(await waitForSupabaseReady(1500))) {
    throw new Error("Local Supabase script did not initialize.");
  }
}

async function initializeSupabaseClient() {
  console.log("initializeSupabaseClient start", {
    hasWindowSupabase: !!window.supabase,
    hasCreateClient: typeof window.createClient === "function",
  });

  if (window.supabase && typeof window.supabase.createClient === "function") {
    supabaseClient = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
    );
    console.log("Supabase client created via window.supabase");
    return;
  }

  if (typeof window.createClient === "function") {
    supabaseClient = window.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("Supabase client created via window.createClient");
    return;
  }

  try {
    await loadSupabaseLocalScript();
  } catch (err) {
    console.error("Supabase local library didn't load properly!", err);
    showNotification("Supabase load failed. Check console.", "error");
    return;
  }

  if (window.supabase && typeof window.supabase.createClient === "function") {
    supabaseClient = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
    );
    console.log(
      "Supabase client created after dynamic load via window.supabase",
    );
    return;
  }

  if (typeof window.createClient === "function") {
    supabaseClient = window.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log(
      "Supabase client created after dynamic load via window.createClient",
    );
    return;
  }

  console.error(
    "Supabase CDN library loaded but the expected global was not found.",
  );
  showNotification("Supabase loaded but could not initialize.", "error");
}

async function verifySupabaseConnection() {
  if (!supabaseClient) {
    console.error(
      "Supabase client is not initialized. Check the CDN script and network.",
    );
    return;
  }

  console.log("Supabase global object:", window.supabase);
  console.log("Supabase client object:", supabaseClient);
  if (typeof supabaseClient.auth?.getSession === "function") {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) {
      console.warn("Supabase auth session check failed:", error);
    } else {
      console.log("Supabase auth session available:", data);
    }
  }

  try {
    const { data: questions, error } = await supabaseClient
      .from("questions")
      .select("id")
      .limit(1);
    if (error) {
      console.warn("Supabase questions test query failed:", error);
    } else {
      console.log("Supabase questions table query succeeded.", questions);
    }
  } catch (err) {
    console.error("Supabase health check failed:", err);
  }
}

function isOnline() {
  return navigator.onLine;
}

function getCachedQuestions() {
  const raw = localStorage.getItem(QUESTION_CACHE_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveQuestionsToCache(questions) {
  if (!Array.isArray(questions)) {
    return;
  }
  localStorage.setItem(QUESTION_CACHE_KEY, JSON.stringify(questions));
}

function getOfflineOutbox() {
  const raw = localStorage.getItem(OUTBOX_CACHE_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveOfflineOutbox(items) {
  if (!Array.isArray(items)) {
    return;
  }
  localStorage.setItem(OUTBOX_CACHE_KEY, JSON.stringify(items));
}

function clearOfflineOutbox() {
  localStorage.removeItem(OUTBOX_CACHE_KEY);
}

async function fetchQuestionsFromSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn(
      "Supabase credentials are missing. Using cached questions when available.",
    );
    return getCachedQuestions();
  }

  if (!supabaseClient) {
    console.error("Supabase client is not initialized.");
    return getCachedQuestions();
  }

  const { data, error } = await supabaseClient.from("questions").select("*");

  if (error) {
    console.error("Failed to fetch questions from Supabase:", error);
    return getCachedQuestions();
  }

  if (Array.isArray(data)) {
    saveQuestionsToCache(data);
    return data;
  }

  return getCachedQuestions();
}

async function loadQuestions() {
  if (isOnline()) {
    const questions = await fetchQuestionsFromSupabase();
    if (questions.length) {
      return questions;
    }
  }

  return getCachedQuestions();
}

function saveQuestionOffline(question) {
  if (!question || typeof question !== "object") {
    return;
  }
  const cached = getCachedQuestions();
  cached.push(question);
  saveQuestionsToCache(cached);

  const outbox = getOfflineOutbox();
  outbox.push(question);
  saveOfflineOutbox(outbox);
}

async function syncOfflineQuestions() {
  if (!isOnline()) {
    console.info("Cannot sync while offline.");
    return;
  }

  const outbox = getOfflineOutbox();
  if (!outbox.length) {
    return;
  }

  const { error } = await supabaseClient.from("questions").insert(outbox);
  if (error) {
    console.error("Failed to sync cached questions to Supabase:", error);
    return;
  }

  clearOfflineOutbox();
  console.info("Cached questions synchronized to Supabase.");
}

async function signInUser(email, password) {
  if (!email || !password) {
    throw new Error("Email and password are required.");
  }

  if (supabaseClient) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      throw error;
    }
    return data.user;
  }

  console.warn("Falling back to Supabase REST sign-in.");
  return await supabaseRestSignIn(email, password);
}

async function signUpUser(fullName, email, password, extra = {}) {
  if (!fullName || !email || !password) {
    throw new Error("Name, email, and password are required.");
  }

  // extra = { school_id, school_name, class_level, school_type }
  // These travel as auth metadata; the handle_new_user() trigger copies them
  // into the profiles table, so they are saved even before email confirmation.
  if (supabaseClient) {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, ...extra } },
    });
    if (error) throw error;
    return data.user;
  }

  console.warn("Falling back to Supabase REST sign-up.");
  return await supabaseRestSignUp(fullName, email, password, extra);
}

function redirectToDashboard(role = "student") {
  const page =
    role === "admin" || role === "government"
      ? "admin-dashboard.html"
      : role === "teacher"
        ? "teacher-dashboard.html"
        : "student-dashboard.html";

  window.location.href = page;
}

function showNotification(message, type = "info") {
  const toast = document.getElementById("toast");
  const toastMessage = document.getElementById("toast-message");

  if (toast && toastMessage) {
    toastMessage.textContent = message;
    toast.classList.remove("opacity-0", "translate-y-4", "pointer-events-none");

    if (type === "error") {
      toast.classList.add("bg-error", "text-on-error");
      toast.classList.remove("bg-inverse-surface", "text-inverse-on-surface");
    } else {
      toast.classList.remove("bg-error", "text-on-error");
      toast.classList.add("bg-inverse-surface", "text-inverse-on-surface");
    }

    window.clearTimeout(showNotification.timeoutId);
    showNotification.timeoutId = window.setTimeout(() => {
      toast.classList.add("opacity-0", "translate-y-4", "pointer-events-none");
    }, 4000);
  }

  console.log(`${type.toUpperCase()}: ${message}`);
}

window.addEventListener("online", async () => {
  showNotification("Connection restored. Syncing cached questions.");
  await syncOfflineQuestions();
  await fetchQuestionsFromSupabase();
});

window.addEventListener("offline", () => {
  showNotification("Offline mode enabled. Using cached questions.");
});



// Which school portal is this? (looked up from the website address in the
// public.schools table, the same way schools.js / exam.html does it.)
// White label: one row per school in public.schools, each with its own domain.
// While testing on localhost there is no real address, so this domain is used
// (same default as schools.js).
const LOCAL_TEST_DOMAIN = "deeperfect-cbt.com.ng";

let _portalCache = null;
async function getPortalSchool() {
  if (_portalCache) return _portalCache;
  if (!supabaseClient) return null;
  let host = window.location.hostname.toLowerCase().replace(/^www\./, "");
  // local testing only: pretend to be the default school
  if (host === "localhost" || host === "127.0.0.1") host = LOCAL_TEST_DOMAIN;
  const { data, error } = await supabaseClient
    .from("schools")
    .select("id, school_name, domain")
    .eq("domain", host)
    .eq("is_active", true)
    .maybeSingle();
  if (error || !data) return null;
  _portalCache = data;
  return data;
}

// A student belongs to ONE school website: the one they registered on.
// This compares the school saved on the account (profiles.school_id) with the
// school this website address belongs to.
//   reason "mismatch" = the account really belongs to another school's website
//   any other reason  = we could not check (offline, missing client, ...)
async function verifyPortalAccess(user) {
  if (!supabaseClient) {
    return { ok: false, reason: "no-client", message: "Cannot verify your account right now. Please refresh and try again." };
  }
  const portal = await getPortalSchool();
  if (!portal) {
    return { ok: false, reason: "no-portal", message: "This website is not registered as a school portal. Contact support." };
  }
  const { data: profile, error } = await supabaseClient
    .from("profiles")
    .select("role, school_id")
    .eq("id", user.id)
    .maybeSingle();
  if (error) {
    console.warn("Could not read profile for portal check:", error);
    return { ok: false, reason: "error", message: "Could not verify your account. Please try again." };
  }
  if (!profile || profile.school_id == null || String(profile.school_id) !== String(portal.id)) {
    return {
      ok: false,
      reason: "mismatch",
      message: `This account is not registered on the ${portal.school_name} website. Please log in on the website you registered with.`,
    };
  }
  return { ok: true, role: profile.role || user?.user_metadata?.role || "student", portal };
}

async function signOutEverywhere() {
  try {
    await supabaseClient?.auth?.signOut();
  } catch (err) {
    console.warn("Sign out failed:", err);
  }
  supabaseAccessToken = null;
  localStorage.removeItem("supabase_access_token");
}

// Runs on every page except the public ones. If someone is signed in but their
// account belongs to a different school's website, sign them out.
// (We only act on a definite "mismatch", never when offline, so exams that are
// running without internet are not interrupted.)
async function guardPortalSession() {
  const page = window.location.pathname.split("/").pop().toLowerCase();
  if (["", "index", "index.html", "register", "register.html"].includes(page)) return;
  if (!supabaseClient?.auth?.getUser || !isOnline()) return;
  try {
    const { data } = await supabaseClient.auth.getUser();
    const user = data?.user;
    if (!user) return; // each page already sends visitors who are not signed in to register.html
    const access = await verifyPortalAccess(user);
    if (!access.ok && access.reason === "mismatch") {
      await signOutEverywhere();
      window.location.href = "register.html?portal=wrong";
    }
  } catch (err) {
    console.warn("Portal session check skipped:", err);
  }
}

function attachAuthHandlers() {
  const loginForm = document.getElementById("login-form");
  const signupForm = document.getElementById("signup-form");

  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const email = document.getElementById("login-email")?.value.trim();
      const password = document.getElementById("login-password")?.value;
      console.log("Login attempt for:", email);

      if (!email || !password) {
        showNotification("Please enter both email and password.", "error");
        return;
      }

      try {
        const user = await signInUser(email, password);
        showNotification("Login successful. Verifying account credentials...");

        // The account must belong to THIS website's school. Students of another
        // school's website are refused here and signed straight out again.
        const access = await verifyPortalAccess(user);
        if (!access.ok) {
          await signOutEverywhere();
          showNotification(access.message, "error");
          return;
        }

        redirectToDashboard(access.role);
      } catch (err) {
        showNotification(err.message || "Login failed.", "error");
      }
    });
  }

  if (signupForm) {
    signupForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const fullName = document.getElementById("signup-name")?.value.trim();
      const email = document.getElementById("signup-email")?.value.trim();
      const password = document.getElementById("signup-password")?.value;
      const confirmPassword = document.getElementById(
        "signup-confirm-password",
      )?.value;
      const classLevel = document.getElementById("signup-class")?.value;
      const schoolType = document.getElementById("signup-school-type")?.value;

      if (!fullName || !email || !password) {
        showNotification("Please complete all signup fields.", "error");
        return;
      }
      if (schoolType !== "senior" && schoolType !== "junior") {
        showNotification("Please select Senior or Junior.", "error");
        return;
      }
      if (!classLevel) {
        showNotification("Please select your class.", "error");
        return;
      }
      // JSS classes belong to Junior, SS classes to Senior
      const classIsJunior = /^JSS/i.test(classLevel);
      if ((schoolType === "junior") !== classIsJunior) {
        showNotification(
          `${classLevel} does not belong to the ${schoolType} section.`,
          "error",
        );
        return;
      }
      if (password.length < 8) {
        showNotification("Password must be at least 8 characters.", "error");
        return;
      }
      if (password !== confirmPassword) {
        showNotification("Passwords do not match.", "error");
        return;
      }

      try {
        const portal = await getPortalSchool();
        if (!portal) {
          showNotification(
            "This website is not registered as a school portal. Contact support.",
            "error",
          );
          return;
        }
        await signUpUser(fullName, email, password, {
          // The school is decided by the website address the student is on,
          // so each school's dashboard only ever sees its own students.
          school_id: portal.id,
          school_name: portal.school_name,
          class_level: classLevel,
          school_type: schoolType,
        });
        showNotification(
          "Account created. Please verify your email and sign in.",
        );
      } catch (err) {
        showNotification(err.message || "Sign up failed.", "error");
      }
    });
  }
}

function buildChatMessageElement(text, sender) {
  const wrapper = document.createElement("div");
  wrapper.className =
    "flex gap-4 max-w-3xl" +
    (sender === "user" ? " ml-auto flex-row-reverse" : "");

  const avatar = document.createElement("div");
  avatar.className =
    "w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center p-1" +
    (sender === "user" ? " bg-secondary-container" : " bg-primary-container");
  const avatarImg = document.createElement("img");
  avatarImg.className = "w-full h-full object-contain";
  avatarImg.src = "img/Ai.png";
  avatarImg.alt = sender === "user" ? "Student avatar" : "AI assistant avatar";
  avatar.appendChild(avatarImg);

  const bubbleWrapper = document.createElement("div");
  bubbleWrapper.className =
    "space-y-2 flex flex-col" + (sender === "user" ? " items-end" : "");

  const bubble = document.createElement("div");
  bubble.className =
    sender === "user"
      ? "bg-primary text-on-primary p-4 rounded-xl chat-bubble-user"
      : "bg-surface-container-low text-on-surface p-4 rounded-xl chat-bubble-ai border border-outline-variant";
  bubble.innerHTML = `<p class=\"font-body-md text-body-md leading-relaxed\">${text}</p>`;

  const timestamp = document.createElement("span");
  timestamp.className = "text-xs text-on-surface-variant px-1";
  timestamp.textContent = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  bubbleWrapper.appendChild(bubble);
  bubbleWrapper.appendChild(timestamp);
  wrapper.appendChild(avatar);
  wrapper.appendChild(bubbleWrapper);

  return wrapper;
}

function appendChatMessage(text, sender) {
  const chatHistory = document.getElementById("chat-history");
  if (!chatHistory) return;

  const messageElement = buildChatMessageElement(text, sender);
  chatHistory.appendChild(messageElement);
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

function sanitizeInput(text) {
  return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function getAiAssistantResponse(question) {
  if (!question.trim()) {
    return "Please type a question and I will explain it step by step.";
  }

  const cleanedQuestion = question.trim();
  const lower = cleanedQuestion.toLowerCase();

  if (/(quadratic|quadratic formula|discriminant|parabola)/.test(lower)) {
    return `A quadratic equation looks like ax² + bx + c = 0. The quadratic formula gives the solutions as x = (-b ± √(b² - 4ac)) / (2a). First compute the discriminant b² - 4ac: if it is positive, there are two real roots; if it is zero, one real root; if it is negative, no real roots in the real numbers. Use the formula step by step to substitute a, b and c.`;
  }

  if (/solve.*x.*=/.test(lower) || /equation/.test(lower)) {
    const linearMatch = lower.match(
      /solve\s*([+-]?\d*\.?\d*)x\s*([+-]\s*\d+\.?\d*)?\s*=\s*([+-]?\d+\.?\d*)/,
    );
    if (linearMatch) {
      let a = parseFloat(linearMatch[1] || "1");
      if (linearMatch[1] === "" || linearMatch[1] === "+") a = 1;
      if (linearMatch[1] === "-") a = -1;
      const b = parseFloat((linearMatch[2] || "+0").replace(/\s+/g, ""));
      const c = parseFloat(linearMatch[3]);
      const result = (c - b) / a;
      return `To solve the linear equation, isolate x. Start with ${linearMatch[1] || "1"}x${linearMatch[2] || "+0"} = ${linearMatch[3]}. Subtract ${linearMatch[2] || "0"} from both sides, then divide by ${a}. That gives x = ${result.toFixed(2)}.`;
    }

    return `This is a solving question. Break it into steps: first rewrite the equation in standard form, then isolate the variable or apply the right formula. If you share the exact expression, I can walk through it step by step.`;
  }

  if (/(factor|factorization|expand|simplify)/.test(lower)) {
    return `Factorization means rewriting an expression as a product of simpler expressions. For example, x² + 5x + 6 factors as (x + 2)(x + 3). Start by looking for two numbers that multiply to the constant term and add to the middle coefficient.`;
  }

  if (/(derivative|integral|calculus|differentiate|integrate)/.test(lower)) {
    return `In calculus, the derivative measures how a function changes and the integral measures accumulation. For a power function xⁿ, the derivative is n·xⁿ⁻¹. If you give me a specific function, I can explain each step.`;
  }

  if (/(physics|force|speed|distance|acceleration)/.test(lower)) {
    return `Physics problems usually use formulas like distance = speed × time or force = mass × acceleration. Identify the known values, choose the right formula, then solve for the unknown.`;
  }

  return `Great question! Here's how I would explain it: read the question carefully, identify what kind of problem it is, then solve it step by step. If you want, paste a full example and I will explain it with numbers and formulas.`;
}

function attachAIChatHandlers() {
  const form = document.getElementById("ai-chat-form");
  const input = document.getElementById("ai-chat-input");
  if (!form || !input) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question) {
      showNotification("Please type a question before sending.", "error");
      return;
    }

    appendChatMessage(sanitizeInput(question), "user");
    input.value = "";
    input.style.height = "auto";

    const aiResponse = getAiAssistantResponse(question);
    appendChatMessage(sanitizeInput(aiResponse), "ai");
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.dispatchEvent(
        new Event("submit", { cancelable: true, bubbles: true }),
      );
    }
  });
}

function initSiteNavigation() {
  const navLinks = document.querySelectorAll("[data-link-page]");
  navLinks.forEach((link) => {
    const page = link.getAttribute("data-link-page");
    if (page) {
      link.href = page;
    }
  });
}

window.addEventListener("DOMContentLoaded", async () => {
  console.log("DOMContentLoaded fired");
  await initializeSupabaseClient();
  await verifySupabaseConnection();
  attachAuthHandlers();
  attachAIChatHandlers();
  initSiteNavigation();
  if (new URLSearchParams(window.location.search).get("portal") === "wrong") {
    showNotification(
      "This account is not registered on this website. Please log in on the website you registered with.",
      "error",
    );
  }
  await guardPortalSession();
});
