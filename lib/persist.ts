import "server-only";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";

let dataDir = path.join(process.cwd(), "data");
let chain: Promise<unknown> = Promise.resolve();

export function setDataDirForTests(next: string | null): void {
  dataDir = next ?? path.join(process.cwd(), "data");
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
  try {
    const raw = await readFile(dataFile(name), "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

export async function writeJson(name: string, value: unknown): Promise<void> {
  const file = dataFile(name);
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2));
  await rename(temporary, file);
}
