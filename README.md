# IT Infra Tracker

Desktop app for Windows 10/11 to track **IT infrastructure tasks and projects** with a colour-coded dashboard.
Offline, single-user, no server or database required.

## Features

| Area | What you get |
|---|---|
| **Dashboard** | KPIs (active projects, open / overdue / critical tasks, done this month, completion rate), charts by status, category and priority, project progress bars, upcoming & overdue list (14 days), 8-week completion trend |
| **Projects** | Category, status, priority, owner, vendor/partner, budget, start/target dates, scope. Progress auto-calculated from linked tasks |
| **Tasks** | Kanban board (drag & drop: To Do → In Progress → Blocked → Done) and sortable list view. Filters by project, category, priority, overdue |
| **Search** | Global search across tasks and projects |
| **Data** | Stored locally in `%APPDATA%\IT Infra Tracker\data.json`. Automatic daily backup (14 days kept in `backups\`). JSON backup/restore, CSV export |
| **Settings** | Team members, categories (Network, Security, Servers, Virtualization, Cloud, Identity & Access, Backup & DR, Monitoring, End-User), light/dark theme |

## Install (Windows 10 / 11)

1. Run `IT-Infra-Tracker-Setup-1.0.0.exe`.
2. Windows SmartScreen may warn because the installer is not code-signed → **More info → Run anyway**.
3. Installs per-user to `%LOCALAPPDATA%\Programs\IT Infra Tracker` (no admin rights needed) and creates Desktop + Start Menu shortcuts.
4. Uninstall from **Settings → Apps** or Start Menu → *Uninstall IT Infra Tracker*. Your data in `%APPDATA%` is kept.

**Portable option:** extract `IT-Infra-Tracker-Portable-1.0.0.zip` and run `IT Infra Tracker.exe`.

The app starts with sample data. Use **Settings → Clear all data** to start clean.

## Build from source

Requirements: Node.js 18+ and NSIS (`makensis`) in PATH (Linux: `apt install nsis zip`).

```bash
npm install
npm start            # run in development
npm run dist:win     # build dist/IT-Infra-Tracker-Setup-<ver>.exe and portable zip
```

## Stack

Electron 33 (context-isolated, sandboxed renderer, CSP), vanilla HTML/CSS/JS, Chart.js 4, NSIS installer.
