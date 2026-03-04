# psys — Process System

Web app to see which processes expose ports (LISTEN) and how they connect to other services (ESTABLISHED). You get a **diagram** and a **table** of listeners (with process name, Docker, port, address) and their outgoing connections. Handy for debugging who’s using which port and which service talks to which.

**Stack:** Next.js 15, TypeScript, Tailwind, shadcn/ui, React Flow.  
**Data:** `ss -tlnp` / `ss -tnp`, process names from `/proc`, optional Docker container labels.

## Run

**Development:**

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The page polls `/api/connections` every 5 seconds.

**Production (background):**

```bash
npm run build
npm run start:bg
```

The app listens on port **30999** with no terminal output. Open http://localhost:30999.

## Alias (recommended)

To start the app in the background with a single command, add this alias to your shell config (`~/.zshrc` or `~/.bashrc`). Replace `/path/to/psys` with the actual path to the project:

```bash
alias psys='cd /path/to/psys && npm run start:bg'
```

Reload your config (`source ~/.zshrc` or `source ~/.bashrc`) and run `psys`. Run `npm run build` in the project at least once beforehand.

## Requirements

- **Linux** (uses `ss` and `/proc`).
- No sudo needed for processes owned by your user; to see all processes you may need to run the server with elevated permissions (not recommended for daily use).
