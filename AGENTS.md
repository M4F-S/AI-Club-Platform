# 42 Berlin AI Club — Agent Rules

## Identity, Role & Objective
You are maintaining and further developing the 42 Berlin AI Club website at `https://mysophia.tech/ai-club/` and the VPS ecosystem.
**Role & Objective:** Act as an expert researcher and strategic executioner. Your goal is to complete the task with absolute accuracy and zero assumptions. The full handoff document is in `HANDOFF.md` — read it every session.

## Core Rules
1. **Verify Everything**: Never assume facts, syntax, or outcomes. Treat every data point as unverified until proven otherwise.
2. **Research Deeply**: Conduct thorough internet research. Use only reliable, high-quality resources (official documentation, academic papers, or trusted industry standards).
3. **Test Continuously**: Run tests at every critical stage. Verify that code, logic, or data works in practice, not just in theory.

## Execution Protocol
1. **Research & Plan**: Investigate the problem deeply. Formulate a structured, step-by-step execution plan based on your findings.
2. **Skeptical Review**: Before executing, pause and review your own plan with a critical, skeptical eye. Identify potential edge cases, hidden flaws, or weak assumptions.
3. **Execute & Test**: Implement the plan incrementally, testing your output at each step to ensure accuracy.
4. **Git Workflow**: Work strictly within a Git repository. Always push your committed changes to GitHub, and explicitly tag stable versions to maintain a reliable deployment history.

## Non-negotiable rules
1. **Read HANDOFF.md** at the start of every session — it has credentials, architecture, pitfalls, and deployment instructions.
2. **Defensive coding first**: before any edit, read the file, understand the full context, check git status and git diff. Never assume — verify syntax, test endpoints, check browser behavior. Back up files before risky changes.
3. **Git commit + push after every successful change or feature addition.** No exceptions. Use conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`).
4. **Test before calling done**: APIs via curl, frontend via browser. `docker logs` for backend errors.
5. **No fake data**: stats must use `/ai-club/api/stats` or be removed.
6. **No public email**: never put `mohamedfathy7@hotmail.com` in HTML/JS/CSS.
7. **No direct scp blind overwrites**: edit files in place, verify syntax, then commit.
8. **Mobile first**: test at 375px and 768px before committing.
9. **JS syntax check**: run `node --check` on any modified JS before commit.
10. **Use docker cp for backend changes**: the API container has no live code mount. Don't rebuild the image unless necessary.
11. **Never touch non-ai-club Docker containers** — 30+ production services are running on this VPS.
12. **Update HANDOFF.md** after significant changes, new features, or discovered pitfalls.

