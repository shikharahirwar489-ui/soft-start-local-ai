const form = document.querySelector("#plan-form");
const taskField = document.querySelector("#task");
const charCount = document.querySelector("#char-count");
const result = document.querySelector("#result");
const sampleButton = document.querySelector("#sample-button");
const submitButton = form.querySelector("button[type='submit']");

const samplePlan = {
  firstStep: "Open a new message and write just the subject line.",
  steps: [
    "Open a new message and write just the subject line.",
    "Add one sentence that answers the main question.",
    "Read it once, then decide whether to send it today.",
  ],
  finishLine: "A draft exists. You can leave the rest for later.",
  time: 5,
  note: "Starting with a draft counts. You don't have to make it perfect yet.",
};

taskField.addEventListener("input", () => {
  charCount.textContent = `${taskField.value.length} / 400`;
});

function showPlan(plan, label) {
  result.hidden = false;
  result.className = "result-card result-visible";
  result.innerHTML = `
    <div class="result-header">
      <div><span class="result-kicker">${label}</span><h2>Your first step</h2></div>
      <span class="time-pill">${plan.time} min</span>
    </div>
    <p class="first-step">${escapeHtml(plan.firstStep)}</p>
    <div class="plan-divider"></div>
    <p class="next-label">IF YOU FEEL LIKE CONTINUING</p>
    <ol class="plan-list">${plan.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
    <div class="finish-line"><span class="finish-check">✓</span><span><strong>Enough for today:</strong> ${escapeHtml(plan.finishLine)}</span></div>
    <p class="kind-note">${escapeHtml(plan.note)}</p>
  `;
  result.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function showError(message) {
  result.hidden = false;
  result.className = "result-card result-visible result-error";
  result.innerHTML = `<div class="result-header"><div><span class="result-kicker">A small pause</span><h2>Couldn’t reach the local model</h2></div><span class="result-spark" aria-hidden="true">✳</span></div><p>${escapeHtml(message)}</p><p class="kind-note">You can still look at a sample plan below. Your task was not saved.</p>`;
  result.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const task = taskField.value.trim();
  if (task.length < 4) {
    taskField.focus();
    return;
  }

  submitButton.disabled = true;
  submitButton.innerHTML = "<span>Thinking gently…</span><span class='spinner' aria-hidden='true'></span>";
  try {
    const response = await fetch("/api/plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        task,
        energy: form.elements.energy.value,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Something went wrong.");
    showPlan(data.plan, `${escapeHtml(data.provider)} · ${escapeHtml(data.model)}`);
  } catch (error) {
    showError(error.message || "Try again in a moment.");
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = "<span>Find my first step</span><span class='arrow' aria-hidden='true'>↗</span>";
  }
});

sampleButton.addEventListener("click", () => {
  if (!taskField.value.trim()) taskField.value = "Reply to an email I've been avoiding";
  charCount.textContent = `${taskField.value.length} / 400`;
  showPlan(samplePlan, "Sample preview · no model used");
});

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}
