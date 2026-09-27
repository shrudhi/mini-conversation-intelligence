import { readJson, withStoreLock, writeJson } from "./persist";
import type { EvalRun, PersistedSession } from "./types";

const SESSIONS = "sessions.json";
const RUNS = "runs.json";

export function listSessions(): Promise<PersistedSession[]> {
  return withStoreLock(() => readJson<PersistedSession[]>(SESSIONS, []));
}

export function getSession(id: string): Promise<PersistedSession | null> {
  return withStoreLock(async () => {
    const sessions = await readJson<PersistedSession[]>(SESSIONS, []);
    return sessions.find((session) => session.id === id) ?? null;
  });
}

export function saveSession(session: PersistedSession): Promise<void> {
  return withStoreLock(async () => {
    const sessions = await readJson<PersistedSession[]>(SESSIONS, []);
    const next = sessions.filter((item) => item.id !== session.id);
    next.push(session);
    await writeJson(SESSIONS, next);
  });
}

export function listRuns(): Promise<EvalRun[]> {
  return withStoreLock(() => readJson<EvalRun[]>(RUNS, []));
}

export function saveRun(run: EvalRun): Promise<void> {
  return withStoreLock(async () => {
    const runs = await readJson<EvalRun[]>(RUNS, []);
    const next = runs.filter((item) => item.id !== run.id && item.sessionId !== run.sessionId);
    next.push(run);
    await writeJson(RUNS, next);
  });
}
