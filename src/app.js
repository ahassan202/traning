/* global Store, Chart, TASK_STATUSES, PROJECT_STATUSES, PRIORITIES, STATUS_COLORS, PRIORITY_COLORS, CATEGORY_PALETTE, uid, todayISO */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = { view: 'dashboard', taskMode: 'board', search: '', sort: { key: 'due', dir: 1 } };
const charts = {};

const VIEW_META = {
  dashboard: ['Dashboard', 'Overview of infrastructure work'],
  projects: ['Projects', 'Infrastructure projects and their progress'],
  tasks: ['Tasks', 'Drag cards between columns to update status'],
  settings: ['Settings', 'Data, backup and lists']
};

/* ---------- Helpers ---------- */
const catColor = (c) => { const i = Store.data.categories.indexOf(c); return CATEGORY_PALETTE[(i < 0 ? 0 : i) % CATEGORY_PALETTE.length]; };
const badge = (text, color) => `<span class="badge" style="--bc:${color}">${esc(text)}</span>`;
const isOverdue = (t) => t.due && t.status !== 'Done' && t.due < todayISO();
const fmtDate = (iso) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const daysFromToday = (iso) => Math.round((new Date(iso + 'T00:00:00') - new Date(todayISO() + 'T00:00:00')) / 86400000);
const projectById = (id) => Store.data.projects.find(p => p.id === id);
const matchSearch = (...fields) => !state.search || fields.join(' ').toLowerCase().includes(state.search);

function projectProgress(p) {
  const tasks = Store.data.tasks.filter(t => t.projectId === p.id);
  if (p.status === 'Completed') return 100;
  if (!tasks.length) return 0;
  return Math.round(tasks.filter(t => t.status === 'Done').length / tasks.length * 100);
}

function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 2200);
}

function fillSelect(sel, options, placeholder) {
  const cur = sel.value;
  sel.innerHTML = `<option value="">${placeholder}</option>` + options.map(o =>
    typeof o === 'string' ? `<option>${esc(o)}</option>` : `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
  sel.value = cur;
}

/* ---------- Navigation ---------- */
function setView(v) {
  state.view = v;
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  $$('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
  $('#viewTitle').textContent = VIEW_META[v][0];
  $('#viewSub').textContent = VIEW_META[v][1];
  render();
}

function render() {
  refreshFilters();
  if (state.view === 'dashboard') renderDashboard();
  if (state.view === 'projects') renderProjects();
  if (state.view === 'tasks') renderTasks();
  if (state.view === 'settings') renderSettings();
}

function refreshFilters() {
  const d = Store.data;
  fillSelect($('#fProjStatus'), PROJECT_STATUSES, 'All statuses');
  fillSelect($('#fProjCat'), d.categories, 'All categories');
  fillSelect($('#fTaskProject'), [{ value: '__none', label: '(No project)' }, ...d.projects.map(p => ({ value: p.id, label: p.name }))], 'All projects');
  fillSelect($('#fTaskCat'), d.categories, 'All categories');
  fillSelect($('#fTaskPrio'), PRIORITIES, 'All priorities');
}

/* ---------- Dashboard ---------- */
function chartTheme() {
  const dark = document.documentElement.dataset.theme === 'dark';
  return { text: dark ? '#cbd5e1' : '#334155', grid: dark ? '#22304d' : '#e2e8f0', surface: dark ? '#111a2e' : '#ffffff' };
}

function drawChart(id, config) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart($('#' + id), config);
}

function renderDashboard() {
  const { tasks, projects } = Store.data;
  const open = tasks.filter(t => t.status !== 'Done');
  const overdue = open.filter(isOverdue);
  const monthStart = todayISO().slice(0, 8) + '01';
  const doneMonth = tasks.filter(t => t.status === 'Done' && (t.completed || '') >= monthStart);
  const activeProj = projects.filter(p => p.status === 'In Progress');
  const critical = open.filter(t => t.priority === 'Critical');
  const doneRate = tasks.length ? Math.round(tasks.filter(t => t.status === 'Done').length / tasks.length * 100) : 0;

  const kpi = (label, value, sub, color) =>
    `<div class="kpi" style="--accent:${color}"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div>`;
  $('#kpis').innerHTML = [
    kpi('Active Projects', activeProj.length, `${projects.length} total`, '#2563eb'),
    kpi('Open Tasks', open.length, `${tasks.length} total`, '#7c3aed'),
    kpi('Overdue', overdue.length, overdue.length ? 'needs attention' : 'all on track', overdue.length ? '#dc2626' : '#16a34a'),
    kpi('Critical Open', critical.length, 'priority: critical', '#ea580c'),
    kpi('Done This Month', doneMonth.length, 'tasks completed', '#16a34a'),
    kpi('Completion Rate', doneRate + '%', 'of all tasks', '#14b8a6')
  ].join('');

  const th = chartTheme();
  Chart.defaults.color = th.text;
  Chart.defaults.font.family = '"Segoe UI", system-ui, sans-serif';
  const legend = { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, padding: 14 } };

  drawChart('chStatus', {
    type: 'doughnut',
    data: {
      labels: TASK_STATUSES,
      datasets: [{ data: TASK_STATUSES.map(s => tasks.filter(t => t.status === s).length), backgroundColor: TASK_STATUSES.map(s => STATUS_COLORS[s]), borderColor: th.surface, borderWidth: 3 }]
    },
    options: { maintainAspectRatio: false, cutout: '62%', plugins: { legend } }
  });

  const cats = Store.data.categories.filter(c => open.some(t => t.category === c));
  drawChart('chCategory', {
    type: 'bar',
    data: { labels: cats, datasets: [{ data: cats.map(c => open.filter(t => t.category === c).length), backgroundColor: cats.map(catColor), borderRadius: 6, maxBarThickness: 28 }] },
    options: {
      indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: th.grid } }, y: { grid: { display: false } } }
    }
  });

  drawChart('chPriority', {
    type: 'bar',
    data: { labels: PRIORITIES, datasets: [{ data: PRIORITIES.map(p => open.filter(t => t.priority === p).length), backgroundColor: PRIORITIES.map(p => PRIORITY_COLORS[p]), borderRadius: 6, maxBarThickness: 46 }] },
    options: {
      maintainAspectRatio: false, plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: th.grid } }, x: { grid: { display: false } } }
    }
  });

  // Weekly completed trend (last 8 weeks, Sunday-start weeks)
  const weeks = [];
  const start = new Date(todayISO() + 'T00:00:00'); start.setDate(start.getDate() - start.getDay() - 7 * 7);
  for (let i = 0; i < 8; i++) {
    const a = new Date(start); a.setDate(a.getDate() + i * 7);
    const b = new Date(a); b.setDate(b.getDate() + 7);
    const ai = a.toISOString().slice(0, 10), bi = b.toISOString().slice(0, 10);
    weeks.push({ label: a.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }), n: tasks.filter(t => t.completed && t.completed >= ai && t.completed < bi).length });
  }
  drawChart('chTrend', {
    type: 'line',
    data: { labels: weeks.map(w => w.label), datasets: [{ data: weeks.map(w => w.n), borderColor: '#14b8a6', backgroundColor: 'rgba(20,184,166,.15)', fill: true, tension: .35, pointRadius: 4, pointBackgroundColor: '#14b8a6' }] },
    options: {
      maintainAspectRatio: false, plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: th.grid } }, x: { grid: { display: false } } }
    }
  });

  // Project progress
  const plist = projects.filter(p => p.status !== 'Completed').sort((a, b) => (a.due || '9') < (b.due || '9') ? -1 : 1);
  $('#projCount').textContent = `${plist.length} open`;
  $('#projProgress').innerHTML = plist.length ? plist.map(p => {
    const pr = projectProgress(p);
    return `<div class="prog-row" data-pid="${p.id}">
      <div class="prog-top"><span class="prog-name">${esc(p.name)}</span><span>${badge(p.status, STATUS_COLORS[p.status])} <b>${pr}%</b></span></div>
      <div class="bar"><span style="width:${pr}%;background:${catColor(p.category)}"></span></div></div>`;
  }).join('') : '<div class="empty">No open projects</div>';

  // Upcoming & overdue
  const horizon = 14;
  const up = open.filter(t => t.due && daysFromToday(t.due) <= horizon).sort((a, b) => a.due < b.due ? -1 : 1);
  $('#upcoming').innerHTML = up.length ? up.map(t => {
    const dd = daysFromToday(t.due);
    const when = dd < 0 ? `<span class="overdue">${-dd}d overdue</span>` : dd === 0 ? '<b>Today</b>' : `in ${dd}d`;
    return `<div class="up-row" data-tid="${t.id}"><span class="dot" style="background:${PRIORITY_COLORS[t.priority]}"></span>
      <span class="up-title">${esc(t.title)} <span class="muted small">· ${esc(t.assignee || 'Unassigned')}</span></span><span class="small">${when}</span></div>`;
  }).join('') : '<div class="empty">Nothing due in the next 14 days</div>';
}

/* ---------- Projects ---------- */
function renderProjects() {
  const fs = $('#fProjStatus').value, fc = $('#fProjCat').value;
  const list = Store.data.projects
    .filter(p => (!fs || p.status === fs) && (!fc || p.category === fc) && matchSearch(p.name, p.description, p.owner, p.vendor, p.category))
    .sort((a, b) => PROJECT_STATUSES.indexOf(a.status) - PROJECT_STATUSES.indexOf(b.status) || ((a.due || '9') < (b.due || '9') ? -1 : 1));
  $('#projectGrid').innerHTML = list.length ? list.map(p => {
    const pr = projectProgress(p);
    const tasks = Store.data.tasks.filter(t => t.projectId === p.id);
    const late = p.due && p.status !== 'Completed' && p.due < todayISO();
    return `<div class="card pcard" data-pid="${p.id}" style="--bc:${catColor(p.category)}">
      <h3>${esc(p.name)}</h3>
      <div class="meta">${badge(p.status, STATUS_COLORS[p.status])}${badge(p.priority, PRIORITY_COLORS[p.priority])}<span class="tag">${esc(p.category)}</span>${p.vendor ? `<span class="tag">${esc(p.vendor)}</span>` : ''}</div>
      <p class="desc">${esc(p.description || 'No description')}</p>
      <div class="prog-top small"><span>${tasks.filter(t => t.status === 'Done').length}/${tasks.length} tasks</span><b>${pr}%</b></div>
      <div class="bar"><span style="width:${pr}%;background:${catColor(p.category)}"></span></div>
      <div class="foot"><span>👤 ${esc(p.owner || '—')}</span><span class="${late ? 'overdue' : ''}">Due ${fmtDate(p.due)}</span></div>
    </div>`;
  }).join('') : '<div class="card empty">No projects found. Click “+ Project” to add one.</div>';
}

/* ---------- Tasks ---------- */
function filteredTasks() {
  const fp = $('#fTaskProject').value, fc = $('#fTaskCat').value, fpr = $('#fTaskPrio').value, fo = $('#fOverdue').checked;
  return Store.data.tasks.filter(t =>
    (!fp || (fp === '__none' ? !t.projectId : t.projectId === fp)) &&
    (!fc || t.category === fc) && (!fpr || t.priority === fpr) && (!fo || isOverdue(t)) &&
    matchSearch(t.title, t.notes, t.assignee, t.category, projectById(t.projectId)?.name));
}

function taskCard(t) {
  const proj = projectById(t.projectId);
  const due = t.due ? `<span class="${isOverdue(t) ? 'overdue' : ''}">📅 ${fmtDate(t.due)}</span>` : '';
  return `<div class="tcard" draggable="true" data-tid="${t.id}" style="--bc:${PRIORITY_COLORS[t.priority]}">
    <div class="t-title">${esc(t.title)}</div>
    <div class="t-meta">${badge(t.priority, PRIORITY_COLORS[t.priority])}<span class="tag">${esc(t.category)}</span>${due}</div>
    <div class="t-meta" style="margin-top:6px"><span>👤 ${esc(t.assignee || 'Unassigned')}</span>${proj ? `<span>· ${esc(proj.name)}</span>` : ''}</div>
  </div>`;
}

function renderTasks() {
  const list = filteredTasks();
  const prioRank = (t) => PRIORITIES.indexOf(t.priority);
  $('#taskBoard').classList.toggle('hidden', state.taskMode !== 'board');
  $('#taskList').classList.toggle('hidden', state.taskMode !== 'list');

  if (state.taskMode === 'board') {
    $('#taskBoard').innerHTML = TASK_STATUSES.map(s => {
      const items = list.filter(t => t.status === s).sort((a, b) => prioRank(a) - prioRank(b) || ((a.due || '9') < (b.due || '9') ? -1 : 1));
      return `<div class="col" data-status="${s}">
        <div class="col-h"><span class="dot" style="background:${STATUS_COLORS[s]}"></span>${s}<span class="count">${items.length}</span></div>
        ${items.map(taskCard).join('') || '<div class="empty small">Drop tasks here</div>'}
      </div>`;
    }).join('');
    bindDrag();
  } else {
    const { key, dir } = state.sort;
    const val = (t) => key === 'project' ? (projectById(t.projectId)?.name || '') : key === 'priority' ? prioRank(t) : key === 'status' ? TASK_STATUSES.indexOf(t.status) : (t[key] || '￿');
    list.sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * dir);
    const cols = [['title', 'Task'], ['project', 'Project'], ['category', 'Category'], ['priority', 'Priority'], ['status', 'Status'], ['assignee', 'Assignee'], ['due', 'Due']];
    $('#taskTable').innerHTML = `<thead><tr>${cols.map(([k, l]) => `<th data-sort="${k}">${l}${key === k ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
      <tbody>${list.map(t => `<tr data-tid="${t.id}">
        <td>${esc(t.title)}</td><td>${esc(projectById(t.projectId)?.name || '—')}</td><td><span class="tag">${esc(t.category)}</span></td>
        <td>${badge(t.priority, PRIORITY_COLORS[t.priority])}</td><td>${badge(t.status, STATUS_COLORS[t.status])}</td>
        <td>${esc(t.assignee || '—')}</td><td class="${isOverdue(t) ? 'overdue' : ''}">${fmtDate(t.due)}</td></tr>`).join('') ||
        '<tr><td colspan="7" class="empty">No tasks found</td></tr>'}</tbody>`;
  }
}

function setTaskStatus(t, status) {
  if (t.status === status) return;
  t.status = status;
  t.completed = status === 'Done' ? todayISO() : '';
  Store.upsert('tasks', t);
}

function bindDrag() {
  $$('.tcard').forEach(c => {
    c.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', c.dataset.tid); c.classList.add('dragging'); });
    c.addEventListener('dragend', () => c.classList.remove('dragging'));
  });
  $$('.col').forEach(col => {
    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drag-over'); });
    col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
    col.addEventListener('drop', e => {
      e.preventDefault(); col.classList.remove('drag-over');
      const t = Store.data.tasks.find(x => x.id === e.dataTransfer.getData('text/plain'));
      if (t) { setTaskStatus(t, col.dataset.status); renderTasks(); toast(`Moved to ${col.dataset.status}`); }
    });
  });
}

/* ---------- Settings ---------- */
async function renderSettings() {
  $('#dataPath').textContent = window.api ? await window.api.dataPath() : 'Browser localStorage (preview mode)';
  const chips = (arr, kind) => arr.map((x, i) => `<span class="chip">${esc(x)}<button data-kind="${kind}" data-i="${i}" title="Remove">✕</button></span>`).join('') || '<span class="muted">None yet</span>';
  $('#peopleList').innerHTML = chips(Store.data.people, 'people');
  $('#catList').innerHTML = chips(Store.data.categories, 'categories');
}

function addListItem(kind, input) {
  const v = input.value.trim();
  if (!v) return;
  if (Store.data[kind].includes(v)) return toast('Already exists');
  Store.data[kind].push(v); Store.save(); input.value = ''; renderSettings();
}

/* ---------- Modal / Forms ---------- */
let modalCtx = null;

function field(def, value) {
  const { name, label, type = 'text', options, required, full } = def;
  const req = required ? ' <span class="req">*</span>' : '';
  let input;
  if (type === 'select') {
    input = `<select class="input" name="${name}">${options.map(o => {
      const [v, l] = typeof o === 'string' ? [o, o] : [o.value, o.label];
      return `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(l)}</option>`;
    }).join('')}</select>`;
  } else if (type === 'textarea') {
    input = `<textarea class="input" name="${name}">${esc(value)}</textarea>`;
  } else if (type === 'datalist') {
    input = `<input class="input" name="${name}" list="dl-${name}" value="${esc(value)}"><datalist id="dl-${name}">${options.map(o => `<option value="${esc(o)}">`).join('')}</datalist>`;
  } else {
    input = `<input class="input" type="${type}" name="${name}" value="${esc(value)}" ${required ? 'required' : ''}>`;
  }
  return `<div class="field ${full ? 'full' : ''}"><label>${label}${req}</label>${input}</div>`;
}

function openModal(kind, item) {
  const d = Store.data;
  const isNew = !item;
  const defs = kind === 'tasks' ? [
    { name: 'title', label: 'Task title', required: true, full: true },
    { name: 'projectId', label: 'Project', type: 'select', options: [{ value: '', label: '(No project)' }, ...d.projects.map(p => ({ value: p.id, label: p.name }))] },
    { name: 'category', label: 'Category', type: 'select', options: d.categories },
    { name: 'priority', label: 'Priority', type: 'select', options: PRIORITIES },
    { name: 'status', label: 'Status', type: 'select', options: TASK_STATUSES },
    { name: 'assignee', label: 'Assignee', type: 'datalist', options: d.people },
    { name: 'due', label: 'Due date', type: 'date' },
    { name: 'notes', label: 'Notes', type: 'textarea', full: true }
  ] : [
    { name: 'name', label: 'Project name', required: true, full: true },
    { name: 'category', label: 'Category', type: 'select', options: d.categories },
    { name: 'status', label: 'Status', type: 'select', options: PROJECT_STATUSES },
    { name: 'priority', label: 'Priority', type: 'select', options: PRIORITIES },
    { name: 'owner', label: 'Owner', type: 'datalist', options: d.people },
    { name: 'vendor', label: 'Vendor / Partner' },
    { name: 'budget', label: 'Budget', type: 'number' },
    { name: 'start', label: 'Start date', type: 'date' },
    { name: 'due', label: 'Target date', type: 'date' },
    { name: 'description', label: 'Description / Scope', type: 'textarea', full: true }
  ];
  const defaults = kind === 'tasks'
    ? { priority: 'Medium', status: 'To Do', category: d.categories[0], projectId: $('#fTaskProject').value.replace('__none', '') }
    : { priority: 'Medium', status: 'Planning', category: d.categories[0], start: todayISO() };
  const obj = item ? { ...item } : defaults;
  modalCtx = { kind, item };
  $('#modalTitle').textContent = `${isNew ? 'New' : 'Edit'} ${kind === 'tasks' ? 'Task' : 'Project'}`;
  $('#modalForm').innerHTML = defs.map(f => field(f, obj[f.name] ?? '')).join('');
  $('#modalDelete').classList.toggle('hidden', isNew);
  $('#modal').classList.remove('hidden');
  setTimeout(() => $('#modalForm .input')?.focus(), 30);
}

function closeModal() { $('#modal').classList.add('hidden'); modalCtx = null; }

function saveModal() {
  const form = $('#modalForm');
  if (!form.reportValidity()) return;
  const { kind, item } = modalCtx;
  const values = Object.fromEntries(new FormData(form).entries());
  if (values.budget !== undefined) values.budget = values.budget === '' ? '' : Number(values.budget);
  const obj = { ...(item || { id: uid(), created: todayISO() }), ...values };
  if (kind === 'tasks') {
    if (obj.status === 'Done' && !obj.completed) obj.completed = todayISO();
    if (obj.status !== 'Done') obj.completed = '';
  }
  const person = kind === 'tasks' ? obj.assignee : obj.owner;
  if (person && !Store.data.people.includes(person)) Store.data.people.push(person);
  Store.upsert(kind, obj);
  closeModal(); render();
  toast(item ? 'Saved' : 'Created');
}

function deleteFromModal() {
  const { kind, item } = modalCtx;
  const extra = kind === 'projects' ? ' Linked tasks will be kept without a project.' : '';
  if (!confirm(`Delete "${item.title || item.name}"?${extra}`)) return;
  Store.remove(kind, item.id);
  closeModal(); render(); toast('Deleted');
}

/* ---------- Export / Import ---------- */
function toCSV(rows) {
  const cell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n');
}

async function saveFile(content, name, ext, label) {
  if (window.api) {
    const p = await window.api.exportFile(content, name, [{ name: label, extensions: [ext] }]);
    if (p) toast('Saved: ' + p);
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
    a.download = name; a.click(); URL.revokeObjectURL(a.href);
  }
}

function exportTasksCSV() {
  const rows = [['Title', 'Project', 'Category', 'Priority', 'Status', 'Assignee', 'Due', 'Completed', 'Notes'],
    ...filteredTasks().map(t => [t.title, projectById(t.projectId)?.name || '', t.category, t.priority, t.status, t.assignee, t.due, t.completed, t.notes])];
  saveFile(toCSV(rows), `tasks-${todayISO()}.csv`, 'csv', 'CSV');
}

function exportProjectsCSV() {
  const rows = [['Name', 'Category', 'Status', 'Priority', 'Owner', 'Vendor', 'Budget', 'Start', 'Due', 'Progress %', 'Description'],
    ...Store.data.projects.map(p => [p.name, p.category, p.status, p.priority, p.owner, p.vendor, p.budget, p.start, p.due, projectProgress(p), p.description])];
  saveFile(toCSV(rows), `projects-${todayISO()}.csv`, 'csv', 'CSV');
}

async function restoreBackup() {
  let raw = null;
  if (window.api) raw = await window.api.importFile();
  else {
    raw = await new Promise(res => {
      const i = document.createElement('input'); i.type = 'file'; i.accept = '.json';
      i.onchange = () => i.files[0] ? i.files[0].text().then(res) : res(null); i.click();
    });
  }
  if (!raw) return;
  try {
    const d = JSON.parse(raw);
    if (!Array.isArray(d.tasks) || !Array.isArray(d.projects)) throw new Error('Invalid backup file');
    if (!confirm(`Restore ${d.projects.length} projects and ${d.tasks.length} tasks? Current data will be replaced.`)) return;
    Store.data = Store.normalize(d); await Store.flush(); applyTheme(); render(); toast('Backup restored');
  } catch (e) { alert('Restore failed: ' + e.message); }
}

/* ---------- Theme ---------- */
function applyTheme() { document.documentElement.dataset.theme = Store.data.settings.theme || 'light'; }

/* ---------- Events ---------- */
function bindEvents() {
  $$('.nav-item').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
  $('#btnNewTask').addEventListener('click', () => openModal('tasks'));
  $('#btnNewProject').addEventListener('click', () => openModal('projects'));
  $('#modalClose').addEventListener('click', closeModal);
  $('#modalCancel').addEventListener('click', closeModal);
  $('#modalSave').addEventListener('click', saveModal);
  $('#modalDelete').addEventListener('click', deleteFromModal);
  $('#modalForm').addEventListener('submit', e => { e.preventDefault(); saveModal(); });
  $('#modal').addEventListener('mousedown', e => { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modalCtx) closeModal();
    if (e.key === 'Enter' && e.ctrlKey && modalCtx) saveModal();
  });

  // open items by clicking
  document.addEventListener('click', e => {
    const tEl = e.target.closest('[data-tid]');
    const pEl = e.target.closest('[data-pid]');
    if (tEl && !e.target.closest('.modal')) return openModal('tasks', Store.data.tasks.find(t => t.id === tEl.dataset.tid));
    if (pEl && !e.target.closest('.modal')) return openModal('projects', projectById(pEl.dataset.pid));
    const th = e.target.closest('th[data-sort]');
    if (th) { const k = th.dataset.sort; state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : 1 }; renderTasks(); }
    const rm = e.target.closest('.chip button');
    if (rm) { Store.data[rm.dataset.kind].splice(+rm.dataset.i, 1); Store.save(); renderSettings(); }
  });

  $('#globalSearch').addEventListener('input', e => {
    state.search = e.target.value.trim().toLowerCase();
    if (state.search && state.view === 'dashboard') setView('tasks'); else render();
  });
  ['#fProjStatus', '#fProjCat'].forEach(s => $(s).addEventListener('change', renderProjects));
  ['#fTaskProject', '#fTaskCat', '#fTaskPrio', '#fOverdue'].forEach(s => $(s).addEventListener('change', renderTasks));
  $$('.seg-btn').forEach(b => b.addEventListener('click', () => {
    state.taskMode = b.dataset.mode;
    $$('.seg-btn').forEach(x => x.classList.toggle('active', x === b)); renderTasks();
  }));

  $('#btnExportTasks').addEventListener('click', exportTasksCSV);
  $('#btnExportProjects').addEventListener('click', exportProjectsCSV);
  $('#btnBackup').addEventListener('click', () => saveFile(JSON.stringify(Store.data, null, 2), `itinfra-backup-${todayISO()}.json`, 'json', 'JSON Backup'));
  $('#btnRestore').addEventListener('click', restoreBackup);
  $('#btnOpenFolder').addEventListener('click', () => window.api ? window.api.openDataFolder() : toast('Available in desktop app'));
  $('#btnAddPerson').addEventListener('click', () => addListItem('people', $('#newPerson')));
  $('#btnAddCat').addEventListener('click', () => addListItem('categories', $('#newCat')));
  $('#newPerson').addEventListener('keydown', e => e.key === 'Enter' && addListItem('people', e.target));
  $('#newCat').addEventListener('keydown', e => e.key === 'Enter' && addListItem('categories', e.target));
  $('#btnReset').addEventListener('click', async () => {
    if (!confirm('Delete ALL projects and tasks? This cannot be undone.')) return;
    Store.data.projects = []; Store.data.tasks = []; await Store.flush(); render(); toast('All data cleared');
  });
  $('#btnLoadSample').addEventListener('click', async () => {
    if ((Store.data.tasks.length || Store.data.projects.length) && !confirm('Replace current data with sample data?')) return;
    Store.data = sampleData(); await Store.flush(); applyTheme(); render(); toast('Sample data loaded');
  });
  $('#themeToggle').addEventListener('click', () => {
    Store.data.settings.theme = Store.data.settings.theme === 'dark' ? 'light' : 'dark';
    Store.save(); applyTheme(); render();
  });
  window.addEventListener('beforeunload', () => Store.flush());
}

(async function boot() {
  await Store.init();
  applyTheme();
  bindEvents();
  render();
})();
