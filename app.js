(() => {
  const questions = window.QUESTIONS || [];
  const KEY = "esddz-quiz-progress-v2";
  const LEGACY_KEY = "esddz-quiz-progress-v1";
  const DB_NAME = "esddz-quiz-db";
  const STORE_NAME = "progress";
  const DEFAULT_STATE = { answers: {}, lastIndex: 0, wrong: [], updatedAt: 0 };

  const normalizeState = (value) => ({
    answers: value && typeof value.answers === "object" && value.answers ? value.answers : {},
    lastIndex: Number.isInteger(value?.lastIndex) ? value.lastIndex : 0,
    wrong: Array.isArray(value?.wrong) ? value.wrong.map(String) : [],
    updatedAt: Number(value?.updatedAt || 0)
  });

  function readLocalState() {
    try {
      const raw = localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY);
      return raw ? normalizeState(JSON.parse(raw)) : { ...DEFAULT_STATE };
    } catch (error) {
      console.warn("Unable to read local progress", error);
      return { ...DEFAULT_STATE };
    }
  }

  let state = readLocalState();
  let session = [];
  let cursor = 0;
  let selections = new Set();
  let submitted = false;
  let sessionResults = {};
  let currentMode = "all";

  const $ = (id) => document.getElementById(id);
  const views = ["homeView", "quizView", "summaryView"];
  const answerLetters = (answer) => (answer.match(/[A-D]/g) || []).sort();
  const optionLetter = (text) => (text.match(/[A-D]/) || [""])[0];

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) return resolve(null);
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function readDbState() {
    try {
      const db = await openDb();
      if (!db) return null;
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const request = tx.objectStore(STORE_NAME).get(KEY);
        request.onsuccess = () => resolve(request.result ? normalizeState(request.result) : null);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.warn("Unable to read IndexedDB progress", error);
      return null;
    }
  }

  async function writeDbState(snapshot) {
    try {
      const db = await openDb();
      if (!db) return;
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(snapshot, KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (error) {
      console.warn("Unable to save IndexedDB progress", error);
    }
  }

  function save() {
    state.updatedAt = Date.now();
    const snapshot = normalizeState(state);
    try {
      localStorage.setItem(KEY, JSON.stringify(snapshot));
      localStorage.removeItem(LEGACY_KEY);
    } catch (error) {
      console.warn("Unable to save local progress", error);
    }
    void writeDbState(snapshot);
  }

  async function hydratePersistentState() {
    const dbState = await readDbState();
    if (dbState && dbState.updatedAt > state.updatedAt) state = dbState;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {}
    updateHome();
  }

  function showView(id) {
    views.forEach((name) => $(name).classList.toggle("active", name === id));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateHome() {
    const records = Object.values(state.answers);
    const correct = records.filter((x) => x.correct).length;
    $("doneCount").textContent = records.length;
    $("accuracy").textContent = records.length ? `${Math.round(correct / records.length * 100)}%` : "--";
    $("wrongCount").textContent = state.wrong.length;
    $("wrongHint").textContent = state.wrong.length ? `${state.wrong.length}道待巩固` : "暂无错题";
    $("progressText").textContent = `${records.length} / ${questions.length}`;
    $("progressBar").style.width = `${questions.length ? records.length / questions.length * 100 : 0}%`;
    $("continueHint").textContent = `从第${Math.min(state.lastIndex + 1, questions.length || 1)}题继续`;
    $("headerMeta").textContent = `${questions.length}题`;
  }

  function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function start(mode) {
    currentMode = mode;
    const labels = { continue: "继续练习", random10: "随机10题", random20: "随机20题", random50: "随机50题", all: "全部题库", wrong: "错题重练" };
    if (mode === "continue") {
      session = questions.slice(state.lastIndex).concat(questions.slice(0, state.lastIndex));
    } else if (mode === "wrong") {
      session = questions.filter((q) => state.wrong.includes(String(q.id)));
      if (!session.length) return;
    } else if (mode.startsWith("random")) {
      session = shuffle(questions).slice(0, Number(mode.replace("random", "")));
    } else {
      session = [...questions];
    }
    cursor = 0;
    selections = new Set();
    submitted = false;
    sessionResults = {};
    $("quizMode").textContent = labels[mode];
    showView("quizView");
    renderQuestion();
  }

  function renderQuestion() {
    const q = session[cursor];
    if (!q) return finish();
    selections = new Set();
    submitted = false;
    $("questionType").textContent = q.type === 2 ? "多项选择题" : "单项选择题";
    $("questionText").textContent = q.stem;
  const globalIndex = questions.findIndex((x) => String(x.id) === String(q.id));
const useGlobalPosition = currentMode === "continue" || currentMode === "all";
const displayIndex = useGlobalPosition && globalIndex >= 0 ? globalIndex + 1 : cursor + 1;
const displayTotal = useGlobalPosition ? questions.length : session.length;

$("quizPosition").textContent = `${displayIndex} / ${displayTotal}`;
$("quizProgress").style.width = `${displayTotal ? displayIndex / displayTotal * 100 : 0}%`;
    
    $("options").innerHTML = "";
    q.options.forEach((option) => {
      const letter = optionLetter(option.text);
      const text = option.text.replace(/^\s*[A-D]\s*/, "");
      const button = document.createElement("button");
      button.className = "option";
      button.dataset.letter = letter;
      button.innerHTML = `<span class="letter">${letter}</span><span>${text}</span>`;
      button.addEventListener("click", () => selectOption(button, q.type));
      $("options").appendChild(button);
    });
    $("result").hidden = true;
    $("result").className = "result";
    $("submitBtn").textContent = "提交答案";
    $("submitBtn").disabled = true;
    $("prevBtn").disabled = cursor === 0;
    $("nextBtn").disabled = true;
  }

  function selectOption(button, type) {
    if (submitted) return;
    const letter = button.dataset.letter;
    if (type === 1) {
      selections.clear();
      document.querySelectorAll(".option").forEach((x) => x.classList.remove("selected"));
      selections.add(letter);
      button.classList.add("selected");
    } else {
      selections.has(letter) ? selections.delete(letter) : selections.add(letter);
      button.classList.toggle("selected");
    }
    $("submitBtn").disabled = selections.size === 0;
  }

  function submit() {
    if (submitted) return next();
    const q = session[cursor];
    const correctLetters = answerLetters(q.answer);
    const picked = [...selections].sort();
    const correct = picked.join("") === correctLetters.join("");
    submitted = true;
    sessionResults[q.id] = correct;
    state.answers[q.id] = { correct, selected: picked, answer: correctLetters };
    const qIndex = questions.findIndex((x) => String(x.id) === String(q.id));
    if (qIndex >= 0) state.lastIndex = (qIndex + 1) % questions.length;
    if (correct) state.wrong = state.wrong.filter((id) => id !== String(q.id));
    else if (!state.wrong.includes(String(q.id))) state.wrong.push(String(q.id));
    save();

    document.querySelectorAll(".option").forEach((button) => {
      const letter = button.dataset.letter;
      button.disabled = true;
      if (correctLetters.includes(letter)) button.classList.add("correct");
      else if (selections.has(letter)) button.classList.add("wrong");
    });
    const result = $("result");
    result.hidden = false;
    result.classList.toggle("bad", !correct);
    result.innerHTML = correct
      ? `<strong>回答正确</strong><br>正确答案：${correctLetters.join("、")}`
      : `<strong>回答错误</strong><br>正确答案：${correctLetters.join("、")}`;
    $("submitBtn").textContent = cursor === session.length - 1 ? "查看成绩" : "下一题";
    $("submitBtn").disabled = false;
    $("nextBtn").disabled = cursor === session.length - 1;
  }

  function previous() {
    if (cursor > 0) { cursor--; renderQuestion(); }
  }

  function next() {
    if (cursor < session.length - 1) { cursor++; renderQuestion(); }
    else finish();
  }

  function finish() {
    const values = Object.values(sessionResults);
    const correct = values.filter(Boolean).length;
    const answered = values.length;
    const wrong = answered - correct;
    const rate = answered ? Math.round(correct / answered * 100) : 0;
    $("summaryScore").textContent = `${rate}分`;
    $("summaryDetail").textContent = `本轮完成${answered}题，共${session.length}题`;
    $("summaryCorrect").textContent = correct;
    $("summaryWrong").textContent = wrong;
    $("summaryRate").textContent = `${rate}%`;
    showView("summaryView");
    updateHome();
  }

  document.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => start(button.dataset.mode)));
  $("submitBtn").addEventListener("click", submit);
  $("prevBtn").addEventListener("click", previous);
  $("nextBtn").addEventListener("click", next);
  $("homeBtn").addEventListener("click", () => { updateHome(); showView("homeView"); });
  $("summaryHomeBtn").addEventListener("click", () => { updateHome(); showView("homeView"); });
  $("againBtn").addEventListener("click", () => start(currentMode));
  $("resetBtn").addEventListener("click", () => $("resetDialog").showModal());
  $("cancelReset").addEventListener("click", () => $("resetDialog").close());
  $("confirmReset").addEventListener("click", () => {
    state = { ...DEFAULT_STATE };
    save();
    updateHome();
    $("resetDialog").close();
    showView("homeView");
  });

  document.addEventListener("keydown", (event) => {
    if (!$("quizView").classList.contains("active")) return;
    if (/^[1-4]$/.test(event.key) && !submitted) document.querySelectorAll(".option")[Number(event.key) - 1]?.click();
    if (event.key === "Enter" && !$("submitBtn").disabled) $("submitBtn").click();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") save();
    else void hydratePersistentState();
  });
  window.addEventListener("pagehide", save);
  window.addEventListener("pageshow", () => void hydratePersistentState());

  updateHome();
  void hydratePersistentState();

  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", async () => {
      try {
        const registration = await navigator.serviceWorker.register("service-worker.js", { updateViaCache: "none" });
        await registration.update();
      } catch (error) {
        console.warn("Service worker registration failed", error);
      }
    });
  }
})();
