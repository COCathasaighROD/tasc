(() => {
  "use strict";

  const KEY = "tasc-tasks-v1";
  const GROUPS = [
    { p: 1, name: "Now", hint: "Working on it today" },
    { p: 2, name: "Next", hint: "Up after Now" },
    { p: 3, name: "Later", hint: "Parked for now" },
  ];

  let tasks = load();
  let editingId = null;
  let dragId = null;
  let seen = new Set();

  const $ = (s) => document.querySelector(s);
  const listsEl = $("#lists");

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY));
      return Array.isArray(raw) ? raw : [];
    } catch (e) { return []; }
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

  /* Rendering */
  function rowHTML(t) {
    const fresh = seen.has(t.id) ? 'style="animation:none"' : "";
    const body = editingId === t.id
      ? `<input class="edit" value="${esc(t.text)}" maxlength="140" aria-label="Edit task">`
      : `<button class="label" type="button" data-act="edit" title="Click to edit">${esc(t.text)}</button>`;
    return `
      <li class="row${t.done ? " done" : ""}" data-id="${t.id}" draggable="${t.done ? "false" : "true"}" ${fresh}>
        <button class="check" type="button" data-act="toggle" aria-label="${t.done ? "Mark as open" : "Mark as done"}" aria-pressed="${t.done}">
          <i class="ph ph-check" aria-hidden="true"></i>
        </button>
        ${body}
        <div class="actions">
          ${t.done ? "" : '<span class="act handle" aria-hidden="true" title="Drag to reorder"><i class="ph ph-dots-six-vertical"></i></span>'}
          <button class="act del" type="button" data-act="delete" aria-label="Delete task"><i class="ph ph-trash" aria-hidden="true"></i></button>
        </div>
      </li>`;
  }

  function render() {
    const open = tasks.filter((t) => !t.done);
    const done = tasks.filter((t) => t.done);
    const wasOpen = $("#doneWrap") ? $("#doneWrap").open : false;

    let html = GROUPS.map((g) => {
      const items = open.filter((t) => t.priority === g.p);
      return `
        <section class="group" data-p="${g.p}">
          <div class="group-head">
            <h2>${g.name}</h2><span class="count">${items.length}</span>
            <span class="hint">${g.hint}</span>
          </div>
          <ul class="rows" data-p="${g.p}">
            ${items.length ? items.map(rowHTML).join("") : `<li class="empty">${g.p === 1 ? "Nothing here yet. Add a task or drag one over." : "Empty. Drag a task here to move it."}</li>`}
          </ul>
        </section>`;
    }).join("");

    html += `
      <details class="done-wrap" id="doneWrap"${wasOpen ? " open" : ""}>
        <summary>
          <i class="ph ph-caret-right caret" aria-hidden="true"></i>
          <h2>Done</h2><span class="count">${done.length}</span>
          ${done.length ? '<button class="clear" type="button" data-act="clear">Clear all</button>' : ""}
        </summary>
        <ul class="rows">
          ${done.length ? done.map(rowHTML).join("") : '<li class="empty">Finished tasks show up here.</li>'}
        </ul>
      </details>`;

    listsEl.innerHTML = html;
    tasks.forEach((t) => seen.add(t.id));

    $("#statOpen").textContent = open.length;
    $("#statDone").textContent = done.length;

    const ed = listsEl.querySelector(".edit");
    if (ed) { ed.focus(); ed.setSelectionRange(ed.value.length, ed.value.length); }
  }

  function update() { save(); render(); }

  /* Add */
  $("#addForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("#taskInput");
    const text = input.value.trim();
    if (!text) return;
    const priority = Number(new FormData(e.target).get("priority"));
    tasks.push({ id: uid(), text, priority, done: false });
    input.value = "";
    input.focus();
    update();
  });

  /* Click actions */
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

  /* Drag and drop between priority groups */
  listsEl.addEventListener("dragstart", (e) => {
    const row = e.target.closest(".row");
    if (!row) return;
    dragId = row.dataset.id;
    row.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dragId);
  });
  listsEl.addEventListener("dragend", () => { dragId = null; clearMarks(); render(); });
  listsEl.addEventListener("dragover", (e) => {
    const rows = e.target.closest(".group .rows");
    if (!rows || !dragId) return;
    e.preventDefault();
    clearMarks();
    rows.closest(".group").classList.add("over");
    const target = e.target.closest(".row");
    if (target && target.dataset.id !== dragId) target.classList.add("drop-before");
  });
  listsEl.addEventListener("drop", (e) => {
    const rows = e.target.closest(".group .rows");
    if (!rows || !dragId) return;
    e.preventDefault();
    const p = Number(rows.dataset.p);
    const moved = tasks.find((t) => t.id === dragId);
    if (!moved) return;
    tasks = tasks.filter((t) => t.id !== dragId);
    moved.priority = p;
    const target = e.target.closest(".row");
    const idx = target ? tasks.findIndex((t) => t.id === target.dataset.id) : -1;
    if (idx >= 0) tasks.splice(idx, 0, moved);
    else tasks.push(moved);
    dragId = null;
    update();
  });
  function clearMarks() {
    listsEl.querySelectorAll(".over, .drop-before").forEach((el) => el.classList.remove("over", "drop-before"));
  }

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
        .map((t) => ({ id: uid(), text: t.text.slice(0, 140), priority: [1, 2, 3].includes(t.priority) ? t.priority : 2, done: !!t.done }));
      tasks = tasks.concat(clean);
      update();
      toast(`Imported ${clean.length} tasks`);
    } catch (err) { toast("That file is not a valid backup"); }
  });

  render();
})();
