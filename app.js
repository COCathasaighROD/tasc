(() => {
  "use strict";

  const KEY = "tasc-tasks-v2";
  const OLD_KEY = "tasc-tasks-v1";
  const TIERS = [
    { p: 1, name: "Urgent", icon: "ph-caret-double-up" },
    { p: 2, name: "High", icon: "ph-caret-up" },
    { p: 3, name: "Medium", icon: "ph-equals" },
    { p: 4, name: "Low", icon: "ph-caret-down" },
  ];
  const tier = (p) => TIERS.find((t) => t.p === p) || TIERS[2];

  let tasks = load();
  let editingId = null;
  let popFor = null;
  const seen = new Set(tasks.map((t) => t.id));

  const $ = (s) => document.querySelector(s);
  const listsEl = $("#lists");
  const pop = $("#pop");

  /* Storage */
  function load() {
    try {
      const v2 = JSON.parse(localStorage.getItem(KEY));
      if (Array.isArray(v2)) return v2;
      // One-time migration from the Now / Next / Later version.
      const v1 = JSON.parse(localStorage.getItem(OLD_KEY));
      if (Array.isArray(v1)) return v1.map((t) => ({ ...t, priority: { 1: 2, 2: 3, 3: 4 }[t.priority] || 3, due: null }));
    } catch (e) {}
    return [];
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(tasks)); } catch (e) { toast("Could not save in this browser"); }
  }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove("show"), 2200);
  }

  /* Dates */
  const startOfToday = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
  const parseDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const daysUntil = (s) => Math.round((parseDate(s) - startOfToday()) / 864e5);

  function dueInfo(s) {
    const d = daysUntil(s);
    if (d < 0) return { text: `${-d} day${d === -1 ? "" : "s"} overdue`, cls: "overdue" };
    if (d === 0) return { text: "Due today", cls: "today" };
    if (d === 1) return { text: "Due tomorrow", cls: "" };
    const date = parseDate(s);
    if (d < 7) return { text: "Due " + date.toLocaleDateString("en-IE", { weekday: "long" }), cls: "" };
    return { text: "Due " + date.toLocaleDateString("en-IE", { day: "numeric", month: "short" }), cls: "" };
  }

  /* Rendering */
  function sorted(list) {
    return list.slice().sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.due && b.due) return a.due < b.due ? -1 : a.due > b.due ? 1 : 0;
      if (a.due) return -1;
      if (b.due) return 1;
      return 0;
    });
  }

  function rowHTML(t) {
    const tr = tier(t.priority);
    const due = t.due ? dueInfo(t.due) : null;
    const body = editingId === t.id
      ? `<input class="edit" value="${esc(t.text)}" maxlength="140" aria-label="Edit task">`
      : `<button class="label" type="button" data-act="edit" title="Click to edit">${esc(t.text)}</button>`;
    const dueChip = t.done ? "" : due
      ? `<button class="chip ${due.cls}" type="button" data-act="pop"><i class="ph ph-calendar-blank" aria-hidden="true"></i>${due.text}</button>`
      : `<button class="chip add-due" type="button" data-act="pop"><i class="ph ph-calendar-plus" aria-hidden="true"></i>Add due date</button>`;
    return `
      <li class="row t${t.priority}${t.done ? " done" : ""}${seen.has(t.id) ? "" : " fresh"}" data-id="${t.id}">
        <button class="check" type="button" data-act="toggle" aria-label="${t.done ? "Mark as open" : "Mark as done"}" aria-pressed="${t.done}">
          <i class="ph ph-check" aria-hidden="true"></i>
        </button>
        ${body}
        <div class="meta">
          ${dueChip}
          ${t.done ? "" : `<button class="chip tier" type="button" data-act="pop" aria-label="Urgency: ${tr.name}. Change"><i class="ph ${tr.icon}" aria-hidden="true"></i>${tr.name}</button>`}
          <button class="act" type="button" data-act="delete" aria-label="Delete task"><i class="ph ph-trash" aria-hidden="true"></i></button>
        </div>
      </li>`;
  }

  function render() {
    const open = tasks.filter((t) => !t.done);
    const done = tasks.filter((t) => t.done);
    const shown = sorted(open);
    const wasOpen = $("#doneWrap") ? $("#doneWrap").open : true;

    // Tiles
    TIERS.forEach((tr) => { $("#n" + tr.p).textContent = open.filter((t) => t.priority === tr.p).length; });

    // Header summary
    const overdue = open.filter((t) => t.due && daysUntil(t.due) < 0).length;
    const today = open.filter((t) => t.due && daysUntil(t.due) === 0).length;
    const bits = [];
    if (overdue) bits.push(`${overdue} overdue`);
    if (today) bits.push(`${today} due today`);
    $("#summary").textContent = !open.length ? "Nothing open right now." : `${open.length} open${bits.length ? ", " + bits.join(", ") : ""}.`;
    $("#today").textContent = new Date().toLocaleDateString("en-IE", { weekday: "long", day: "numeric", month: "long" });

    const groups = TIERS.map((tr) => {
      const items = shown.filter((t) => t.priority === tr.p);
      return items.length ? `
        <section class="group t${tr.p}" id="g${tr.p}">
          <h2 class="group-title"><i class="ph ${tr.icon}" aria-hidden="true"></i>${tr.name}<span class="count">${items.length}</span></h2>
          <ul class="rows">${items.map(rowHTML).join("")}</ul>
        </section>` : "";
    }).join("");

    listsEl.innerHTML = `
      ${groups || '<p class="empty">No open tasks. Add your first one above.</p>'}
      <details class="done-wrap" id="doneWrap"${wasOpen ? " open" : ""}>
        <summary>
          <i class="ph ph-caret-right caret" aria-hidden="true"></i>
          <h2>Done</h2><span class="count">${done.length}</span>
          ${done.length ? '<button class="clear" type="button" data-act="clear">Clear all</button>' : ""}
        </summary>
        ${done.length ? `<ul class="rows">${done.map(rowHTML).join("")}</ul>` : '<p class="empty">Finished tasks show up here.</p>'}
      </details>`;
    tasks.forEach((t) => seen.add(t.id));

    const ed = listsEl.querySelector(".edit");
    if (ed) { ed.focus(); ed.setSelectionRange(ed.value.length, ed.value.length); }
  }

  function update() { save(); closePop(); render(); }

  /* Add */
  $("#addForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("#taskInput");
    const dueEl = $("#dueInput");
    const text = input.value.trim();
    if (!text) return;
    const priority = Number(new FormData(e.target).get("tier"));
    tasks.push({ id: uid(), text, priority, done: false, due: dueEl.value || null });
    input.value = "";
    dueEl.value = "";
    input.focus();
    update();
  });

  /* Tier tiles jump to their group on the same page */
  document.querySelector(".tiers").addEventListener("click", (e) => {
    const tile = e.target.closest(".tile");
    const group = tile && document.getElementById("g" + tile.dataset.tier);
    if (group) group.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  /* Row actions */
  listsEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === "clear") {
      e.preventDefault();
      tasks = tasks.filter((t) => !t.done);
      return update();
    }
    const row = btn.closest(".row");
    const t = row && tasks.find((x) => x.id === row.dataset.id);
    if (!t) return;
    if (act === "toggle") { t.done = !t.done; update(); }
    if (act === "delete") { tasks = tasks.filter((x) => x.id !== t.id); update(); }
    if (act === "edit") { editingId = t.id; render(); }
    if (act === "pop") openPop(t, btn);
  });

  /* Inline edit */
  function finishEdit(input, commit) {
    const row = input.closest(".row");
    const t = tasks.find((x) => x.id === row.dataset.id);
    const v = input.value.trim();
    editingId = null;
    if (commit && t && v) t.text = v;
    update();
  }
  listsEl.addEventListener("keydown", (e) => {
    if (!e.target.classList.contains("edit")) return;
    if (e.key === "Enter") finishEdit(e.target, true);
    if (e.key === "Escape") finishEdit(e.target, false);
  });
  listsEl.addEventListener("focusout", (e) => {
    if (e.target.classList.contains("edit") && editingId) finishEdit(e.target, true);
  });

  /* Popover: change urgency or due date */
  function openPop(t, anchor) {
    if (popFor === t.id && !pop.hidden) return closePop();
    popFor = t.id;
    pop.innerHTML = `
      ${TIERS.map((tr) => `
        <button class="opt t${tr.p}" type="button" role="menuitemradio" aria-checked="${tr.p === t.priority}" data-tier="${tr.p}">
          <i class="ph ${tr.icon}" aria-hidden="true"></i>${tr.name}<i class="ph ph-check tick" aria-hidden="true"></i>
        </button>`).join("")}
      <div class="sep"></div>
      <div class="due-edit">
        <label for="popDue">Due date</label>
        <div class="row2">
          <input id="popDue" class="field" type="date" value="${t.due || ""}">
          ${t.due ? '<button type="button" data-clear-due>Clear</button>' : ""}
        </div>
      </div>`;
    pop.hidden = false;
    const r = anchor.getBoundingClientRect();
    const w = pop.offsetWidth, h = pop.offsetHeight;
    const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
    let top = r.bottom + 8;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 8);
    pop.style.left = left + "px";
    pop.style.top = top + "px";
    pop.querySelector(".opt[aria-checked='true']").focus();
  }
  function closePop() { pop.hidden = true; popFor = null; }

  pop.addEventListener("click", (e) => {
    const t = tasks.find((x) => x.id === popFor);
    if (!t) return;
    const opt = e.target.closest(".opt");
    if (opt) { t.priority = Number(opt.dataset.tier); return update(); }
    if (e.target.closest("[data-clear-due]")) { t.due = null; update(); }
  });
  pop.addEventListener("change", (e) => {
    const t = tasks.find((x) => x.id === popFor);
    if (t && e.target.id === "popDue") { t.due = e.target.value || null; update(); }
  });
  document.addEventListener("click", (e) => {
    if (!pop.hidden && !pop.contains(e.target) && !e.target.closest("[data-act='pop']")) closePop();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !pop.hidden) closePop(); });
  window.addEventListener("resize", closePop);

  /* Theme */
  $("#themeBtn").addEventListener("click", () => {
    const root = document.documentElement;
    const current = root.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("tasc-theme", next); } catch (e) {}
  });

  /* Export and import */
  $("#exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "tasc-backup.json";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Backup downloaded");
  });
  $("#importBtn").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data)) throw new Error("bad");
      const clean = data
        .filter((t) => t && typeof t.text === "string")
        .map((t) => ({
          id: uid(),
          text: t.text.slice(0, 140),
          priority: [1, 2, 3, 4].includes(t.priority) ? t.priority : 3,
          done: !!t.done,
          due: typeof t.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.due) ? t.due : null,
        }));
      tasks = tasks.concat(clean);
      update();
      toast(`Imported ${clean.length} tasks`);
    } catch (err) { toast("That file is not a valid backup"); }
  });

  render();
})();
