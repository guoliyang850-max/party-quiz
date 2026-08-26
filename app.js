(() => {
  const questions = window.QUESTIONS || [];
  const KEY = "esddz-quiz-progress-v1";
  const state = JSON.parse(localStorage.getItem(KEY) || '{"answers":{},"lastIndex":0,"wrong":[]}');
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
  const save = () => localStorage.setItem(KEY, JSON.stringify(state));

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
    $("progressBar").style.width = `${records.length / questions.length * 100}%`;
    $("continueHint").textContent = `从第${Math.min(state.lastIndex + 1, questions.length)}题继续`;
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
    $("quizPosition").textContent = `${cursor + 1} / ${session.length}`;
    $("quizProgress").style.width = `${(cursor + 1) / session.length * 100}%`;
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
    state.answers = {}; state.lastIndex = 0; state.wrong = []; save(); updateHome(); $("resetDialog").close(); showView("homeView");
  });
  document.addEventListener("keydown", (event) => {
    if (!$("quizView").classList.contains("active")) return;
    if (/^[1-4]$/.test(event.key) && !submitted) document.querySelectorAll(".option")[Number(event.key) - 1]?.click();
    if (event.key === "Enter" && !$("submitBtn").disabled) $("submitBtn").click();
  });
  updateHome();
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js"));
  }
})();
