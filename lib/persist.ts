import "server-only";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import os from "os";

/** Vercel’s app directory is read-only; use /tmp there. Local/dev keeps ./data. */
function defaultDataDir(): string {
  if (process.env.VERCEL) {
    return path.join(os.tmpdir(), "velawear-data");
  }
  return path.join(process.cwd(), "data");
}

let dataDir = defaultDataDir();
let chain: Promise<unknown> = Promise.resolve();

/** Warm-instance cache so a failed disk write still serves the latest value in-process. */
const memory = new Map<string, string>();

export function setDataDirForTests(next: string | null): void {
  dataDir = next ?? defaultDataDir();
  memory.clear();
}

export function dataFile(name: string): string {
  return path.join(dataDir, name);
}

export function withStoreLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function readJson<T>(name: string, fallback: T): Promise<T> {
  const cached = memory.get(name);
  if (cached !== undefined) {
    try {
      return JSON.parse(cached) as T;
    } catch {
      memory.delete(name);
    }
  }
  try {
    const raw = await readFile(dataFile(name), "utf8");
    memory.set(name, raw);
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

export async function writeJson(name: string, value: unknown): Promise<void> {
  const serialized = JSON.stringify(value, null, 2);
  memory.set(name, serialized);
  const file = dataFile(name);
  try {
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.tmp`;
    await writeFile(temporary, serialized);
    await rename(temporary, file);
  } catch (error) {
    // On a read-only host without /tmp, keep the in-memory value so the request can still succeed.
    if (process.env.VERCEL) {
      console.warn("persist.writeJson disk failed; using memory only", name, (error as Error).message);
      return;
    }
    throw error;
  }
}
