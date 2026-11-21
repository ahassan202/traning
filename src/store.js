/* Data layer: persists through Electron IPC (JSON file in %APPDATA%), falls back to localStorage in a browser. */
const TASK_STATUSES = ['To Do', 'In Progress', 'Blocked', 'Done'];
const PROJECT_STATUSES = ['Planning', 'In Progress', 'On Hold', 'Completed'];
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];

const STATUS_COLORS = {
  'To Do': '#64748b', 'In Progress': '#2563eb', 'Blocked': '#dc2626', 'Done': '#16a34a',
  'Planning': '#7c3aed', 'On Hold': '#d97706', 'Completed': '#16a34a'
};
const PRIORITY_COLORS = { Critical: '#dc2626', High: '#ea580c', Medium: '#ca8a04', Low: '#0d9488' };
const CATEGORY_PALETTE = ['#2563eb', '#14b8a6', '#7c3aed', '#ea580c', '#db2777', '#0891b2', '#65a30d', '#ca8a04', '#4f46e5', '#dc2626'];

const DEFAULT_CATEGORIES = ['Network', 'Security', 'Servers', 'Virtualization', 'Cloud', 'Identity & Access', 'Backup & DR', 'Monitoring', 'End-User'];

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const todayISO = () => new Date().toISOString().slice(0, 10);
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

function emptyData() {
  return { version: 1, projects: [], tasks: [], categories: [...DEFAULT_CATEGORIES], people: [], settings: { theme: 'light' } };
}

function sampleData() {
  const d = emptyData();
  d.people = ['Ahmed', 'Network Team', 'Security Team', 'SysAdmin', 'Vendor - GBM'];
  const p = (name, category, status, priority, owner, vendor, start, due, budget, description) =>
    ({ id: uid(), name, category, status, priority, owner, vendor, start, due, budget, description, created: todayISO() });
  const P = [
    p('Palo Alto Firewall Upgrade to PAN-OS 11.1', 'Security', 'In Progress', 'High', 'Ahmed', 'Palo Alto / GBM', addDays(-30), addDays(20), 15000, 'HA pair upgrade, content updates, policy cleanup and GlobalProtect portal hardening.'),
    p('MFA Rollout – Azure AD + NPS for VPN', 'Identity & Access', 'In Progress', 'Critical', 'Security Team', 'Microsoft', addDays(-20), addDays(10), 8000, 'Enforce MFA for GlobalProtect using NPS extension with Azure AD; pilot then full rollout.'),
    p('VMware vSphere 8 Migration', 'Virtualization', 'Planning', 'Medium', 'SysAdmin', 'VMware / Broadcom', addDays(5), addDays(75), 40000, 'Upgrade vCenter and ESXi hosts, validate licensing, migrate workloads.'),
    p('Core Switch Refresh – DC', 'Network', 'On Hold', 'High', 'Network Team', 'Cisco', addDays(-10), addDays(60), 55000, 'Replace end-of-life core switches, redesign VLANs and routing.'),
    p('Backup & DR Validation', 'Backup & DR', 'Completed', 'Medium', 'SysAdmin', 'Veeam', addDays(-60), addDays(-5), 5000, 'Quarterly restore tests and DR runbook update.'),
    p('ZTNA Pilot (Prisma Access)', 'Cloud', 'Planning', 'Medium', 'Ahmed', 'Palo Alto', addDays(14), addDays(90), 20000, 'Evaluate ZTNA as replacement for legacy VPN for remote users.')
  ];
  d.projects = P;
  const t = (title, projectIdx, category, status, priority, assignee, due, doneAgoDays) => ({
    id: uid(), title, projectId: projectIdx == null ? '' : P[projectIdx].id, category, status, priority, assignee,
    due, notes: '', created: addDays(-40),
    completed: status === 'Done' ? addDays(-(doneAgoDays || 3)) : ''
  });
  d.tasks = [
    t('Backup running config & take snapshot', 0, 'Security', 'Done', 'High', 'Ahmed', addDays(-12), 12),
    t('Upgrade passive firewall node', 0, 'Security', 'Done', 'High', 'Ahmed', addDays(-6), 6),
    t('Failover and upgrade active node', 0, 'Security', 'In Progress', 'Critical', 'Ahmed', addDays(2)),
    t('Clean up unused security policies', 0, 'Security', 'To Do', 'Medium', 'Security Team', addDays(15)),
    t('Install NPS extension on RADIUS server', 1, 'Identity & Access', 'Done', 'High', 'Security Team', addDays(-8), 8),
    t('Configure GlobalProtect RADIUS auth profile', 1, 'Identity & Access', 'In Progress', 'Critical', 'Ahmed', addDays(1)),
    t('Pilot group MFA enrollment', 1, 'Identity & Access', 'Blocked', 'High', 'Security Team', addDays(-1)),
    t('Collect vSphere licensing from Broadcom', 2, 'Virtualization', 'To Do', 'Medium', 'SysAdmin', addDays(7)),
    t('Hardware compatibility check (HCL)', 2, 'Virtualization', 'To Do', 'Low', 'SysAdmin', addDays(12)),
    t('Receive switch quotation', 3, 'Network', 'Blocked', 'High', 'Vendor - GBM', addDays(-3)),
    t('Restore test – file server', 4, 'Backup & DR', 'Done', 'Medium', 'SysAdmin', addDays(-20), 20),
    t('Update DR runbook', 4, 'Backup & DR', 'Done', 'Low', 'SysAdmin', addDays(-9), 9),
    t('Renew SSL certificate – webmail', null, 'Security', 'To Do', 'Critical', 'Ahmed', addDays(4)),
    t('Review SIEM alerts weekly', null, 'Monitoring', 'In Progress', 'Medium', 'Security Team', addDays(3)),
    t('Patch Windows servers (monthly)', null, 'Servers', 'Done', 'High', 'SysAdmin', addDays(-15), 15),
    t('Replace UPS batteries – server room', null, 'Servers', 'To Do', 'Medium', 'SysAdmin', addDays(25)),
    t('Prisma Access requirements workshop', 5, 'Cloud', 'To Do', 'Medium', 'Ahmed', addDays(16)),
    t('Audit Wi-Fi guest network isolation', null, 'Network', 'Done', 'Medium', 'Network Team', addDays(-30), 30)
  ];
  return d;
}

const Store = {
  data: emptyData(),

  async init() {
    let loaded = null;
    try {
      if (window.api) loaded = await window.api.load();
      else { const raw = localStorage.getItem('itinfra-data'); loaded = raw ? JSON.parse(raw) : null; }
    } catch (_) { loaded = null; }
    this.data = loaded ? this.normalize(loaded) : sampleData();
    if (!loaded) await this.flush();
  },

  normalize(d) {
    const base = emptyData();
    return {
      ...base, ...d,
      projects: Array.isArray(d.projects) ? d.projects : [],
      tasks: Array.isArray(d.tasks) ? d.tasks : [],
      categories: Array.isArray(d.categories) && d.categories.length ? d.categories : base.categories,
      people: Array.isArray(d.people) ? d.people : [],
      settings: { ...base.settings, ...(d.settings || {}) }
    };
  },

  save() { return this.flush(); },

  async flush() {
    try {
      if (window.api) await window.api.save(this.data);
      else localStorage.setItem('itinfra-data', JSON.stringify(this.data));
    } catch (e) { console.error('Save failed', e); }
  },

  upsert(kind, item) {
    const list = this.data[kind];
    const i = list.findIndex(x => x.id === item.id);
    if (i >= 0) list[i] = item; else list.push(item);
    this.save();
  },

  remove(kind, id) {
    this.data[kind] = this.data[kind].filter(x => x.id !== id);
    if (kind === 'projects') this.data.tasks.forEach(t => { if (t.projectId === id) t.projectId = ''; });
    this.save();
  }
};
