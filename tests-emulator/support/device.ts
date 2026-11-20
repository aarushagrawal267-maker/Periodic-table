/**
 * Test side of the simulated devices (see ./device-process.mjs). A Device is a child process with its own copy
 * of the app; `run` sends it a function, which runs there with the device's context and returns a
 * structured-cloneable value. The function is sent as source text, so it must not use anything from the
 * test file's scope: pass what it needs as the second argument.
 */
import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

type ProgressMod = typeof import('../../src/store/progress');
type SettingsMod = typeof import('../../src/store/settings');

export interface DeviceCtx {
  useProgress: ProgressMod['useProgress'];
  EMPTY_PROGRESS: ProgressMod['EMPTY_PROGRESS'];
  useSettings: SettingsMod['useSettings'];
  defaultSettings: SettingsMod['defaultSettings'];
  useAuth: typeof import('../../src/store/auth')['useAuth'];
  account: typeof import('../../src/lib/account');
  sync: typeof import('../../src/lib/sync');
  firebase: typeof import('../../src/lib/firebase');
  merge: typeof import('../../src/lib/merge');
  syncMeta: typeof import('../../src/lib/syncMeta');
  storage: Storage;
  net: { offline: () => Promise<void>; online: () => Promise<void>; isOnline: () => boolean; slow: (urlPart: string, ms: number) => void };
  clock: { advance: (ms: number) => void };
  browser: { databases: () => string[]; cookies: () => string; fire: (type: string) => void };
}

/** What a device starts from: another device's localStorage (see `snapshot`) and IndexedDB database names. */
export interface DeviceSeed {
  storage?: Record<string, string>;
  databases?: string[];
}

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

const DEVICE_SCRIPT = fileURLToPath(new URL('./device-process.mjs', import.meta.url));
const ROOT = fileURLToPath(new URL('../../', import.meta.url));

export class Device {
  private seq = 0;
  private pending = new Map<number, Pending>();
  private log: string[] = [];
  private exited = false;

  private constructor(
    readonly name: string,
    private child: ChildProcess,
  ) {
    child.on('message', (msg: { id?: number; ok?: boolean; value?: unknown; error?: string }) => {
      if (typeof msg?.id !== 'number') return;
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.value);
      else p.reject(new Error(`[${name}] ${msg.error}`));
    });
    const keep = (chunk: Buffer) => {
      this.log.push(chunk.toString());
      if (this.log.length > 400) this.log.splice(0, this.log.length - 400);
    };
    child.stdout?.on('data', keep);
    child.stderr?.on('data', keep);
    child.on('exit', (code) => {
      this.exited = true;
      for (const p of this.pending.values()) p.reject(new Error(`[${name}] device exited (${code})`));
      this.pending.clear();
    });
  }

  /** Starts a device and waits until its copy of the app is loaded. */
  static start(name: string, seed?: DeviceSeed): Promise<Device> {
    const child = fork(DEVICE_SCRIPT, [], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      serialization: 'advanced',
      env: { ...process.env, NODE_ENV: 'test', ...(seed ? { PERIODICA_DEVICE_SEED: JSON.stringify(seed) } : {}) },
    });
    const device = new Device(name, child);
    return new Promise<Device>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`[${name}] did not start:\n${device.logs()}`)), 30_000);
      child.on('message', (msg: { ready?: boolean }) => {
        if (msg?.ready) {
          clearTimeout(timer);
          resolve(device);
        }
      });
      child.on('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`[${name}] exited during start (${code}):\n${device.logs()}`));
      });
    });
  }

  /** Runs `fn` on the device. It sees only its arguments: the device context and `arg`. */
  run<T, A = undefined>(fn: (ctx: DeviceCtx, arg: A) => T | Promise<T>, arg?: A): Promise<Awaited<T>> {
    if (this.exited) return Promise.reject(new Error(`[${this.name}] device has exited`));
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.child.send({ id, src: fn.toString(), arg });
    });
  }

  /**
   * Polls `fn` on the device until it returns a truthy value, then returns that value. A condition,
   * never a fixed sleep: it returns as soon as the device gets there.
   */
  async until<T, A = undefined>(what: string, fn: (ctx: DeviceCtx, arg: A) => T | Promise<T>, arg?: A, timeoutMs = 20_000): Promise<Awaited<T>> {
    const t0 = Date.now();
    let last: unknown;
    for (;;) {
      last = await this.run(fn, arg);
      if (last) return last as Awaited<T>;
      if (Date.now() - t0 > timeoutMs) throw new Error(`[${this.name}] timed out after ${timeoutMs} ms waiting for: ${what} (last value ${JSON.stringify(last)})`);
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  /** Everything in the device's localStorage: what a closed browser keeps on disk. */
  storage(): Promise<Record<string, string>> {
    return this.run((c) => {
      const out: Record<string, string> = {};
      for (let i = 0; i < c.storage.length; i++) {
        const k = c.storage.key(i)!;
        out[k] = c.storage.getItem(k)!;
      }
      return out;
    });
  }

  offline() {
    return this.run((c) => c.net.offline());
  }

  online() {
    return this.run((c) => c.net.online());
  }

  /** Everything the device printed (Firebase warnings, errors), for failure reports. */
  logs(): string {
    return this.log.join('');
  }

  async close(): Promise<void> {
    if (this.exited) return;
    const gone = new Promise<void>((r) => this.child.once('exit', () => r()));
    this.child.kill('SIGKILL');
    await gone;
  }
}
