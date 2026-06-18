/**
 * `WorkerPool` — hands out idle {@link WorkerHandle}s to the runner.
 *
 * See bun-tw-plan.md §8.7 (idle/retry policy) and §8.4 (worker-death
 * reschedule). The pool does **NO scheduling of its own**: concurrency is gated
 * by the `pLimit(maxParallel)` window in the runner (`maxParallel === N`
 * workers, plan §8.2). The pool's only job is to track which workers are idle vs
 * busy vs dead and to hand out the right one:
 *
 *   - `acquire()` — return any idle worker (the common path).
 *   - `acquireDifferentFrom(lastWorkerName)` — prefer an idle worker that is NOT
 *     `lastWorkerName` (retries after a test failure, and worker-death
 *     reschedules, want a clean shot on a different µVM, plan §8.7). Falls back
 *     to the same worker only when it's the only live one (`N === 1`).
 *   - `release(worker)` — mark a worker idle again.
 *   - `markDead(worker)` / `replace(deadName, fresh)` — evict a dead worker and
 *     optionally swap in a freshly-forked replacement (plan §8.4).
 *
 * Acquisition is async: because `pLimit(N)` never admits more than `N`
 * concurrent `run()`s, an idle worker is essentially always available the moment
 * a slot frees — but `replace()` (a fresh fork) can briefly leave the pool
 * short, so `acquire*` await a tiny internal queue rather than throwing.
 */

import type { WorkerHandle } from "../types.ts";

/** A queued acquire request waiting for a worker to become available. */
type Waiter = {
	/** Resolve with the granted worker. */
	resolve: (worker: WorkerHandle) => void;
	/** Reject (only on `close()` of the pool). */
	reject: (error: Error) => void;
	/**
	 * Name of the worker that last ran this unit of work, if any. When set, the
	 * pool prefers granting a DIFFERENT worker (plan §8.7).
	 */
	avoidName?: string;
	/**
	 * When `true`, a different worker is mandatory unless it's the only live one
	 * (worker-death reschedule, plan §8.4); when `false`, "different" is merely
	 * preferred and same-worker is fine if it's the only idle one.
	 */
	strict: boolean;
};

export class WorkerPool {
	/** All live workers (busy or idle). Dead workers are removed on `markDead`. */
	private readonly workers: WorkerHandle[];

	/** FIFO queue of acquire requests awaiting an available worker. */
	private readonly waiters: Waiter[] = [];

	/** Set once `close()` is called — further acquires reject. */
	private closed = false;

	constructor(workers: WorkerHandle[]) {
		this.workers = [...workers];
		for (const worker of this.workers) {
			worker.busy = false;
		}
	}

	/** Current live worker count (busy + idle). */
	get size(): number {
		return this.workers.length;
	}

	/** Snapshot of all live workers (defensive copy). */
	get all(): WorkerHandle[] {
		return [...this.workers];
	}

	/** Acquire any idle worker (the common scheduling path). */
	acquire(): Promise<WorkerHandle> {
		return this.enqueue({ strict: false });
	}

	/**
	 * Acquire an idle worker that is preferably NOT `lastWorkerName` (plan §8.7).
	 *
	 * @param lastWorkerName Worker that previously ran this file, to avoid.
	 * @param strict When `true` (worker-death reschedule, §8.4) a different
	 *   worker is required unless it's the only live one; when `false` (test
	 *   failure retry) a different worker is merely preferred.
	 */
	acquireDifferentFrom(
		lastWorkerName: string | undefined,
		strict = false,
	): Promise<WorkerHandle> {
		return this.enqueue({ avoidName: lastWorkerName, strict });
	}

	/** Mark a worker idle and admit the next compatible waiter. */
	release(worker: WorkerHandle): void {
		worker.busy = false;
		this.pump();
	}

	/**
	 * Evict a dead worker from the pool (plan §8.4) and re-evaluate parked
	 * waiters via `pump()` so any reschedule lands on a healthy worker. If the
	 * dead worker was the LAST live one, parked waiters are rejected (the runner
	 * does not `replace()` dead workers, so they can never be served) — this makes
	 * an N===1 pool fail cleanly instead of deadlocking on the first death.
	 */
	markDead(worker: WorkerHandle): void {
		const index = this.workers.findIndex((w) => w.name === worker.name);
		if (index !== -1) {
			this.workers.splice(index, 1);
		}

		// If the pool is now empty, no future `acquire*` can ever be served (the
		// runner does not `replace()` dead workers). Reject every parked waiter so
		// the run FAILS CLEANLY instead of hanging forever — this is the property
		// that saves an N===1 pool (e.g. the svix shard / `--max=1`): the first
		// death drains the pool to zero, and the reschedule's parked acquire would
		// otherwise block indefinitely. The rejection surfaces as a normal error the
		// runner can report.
		if (this.workers.length === 0 && this.waiters.length > 0) {
			const rejection = new Error(
				"WorkerPool exhausted: all workers died and none were replaced",
			);
			while (this.waiters.length > 0) {
				this.waiters.shift()?.reject(rejection);
			}
			return;
		}

		// Otherwise re-evaluate parked waiters: removing the dead worker may unblock
		// a waiter that was strictly avoiding it (it's now the only live worker, or a
		// different idle worker is the obvious pick), and lets `pickFor` recompute
		// "the only live worker" semantics. Without this pump a death never wakes a
		// parked waiter.
		this.pump();
	}

	/**
	 * Replace a dead worker with a freshly-forked one (plan §8.4: "evict +
	 * replace the dead worker before its slot is reusable"). Removes `deadName`
	 * if still present, adds `fresh` as idle, and admits any parked waiters.
	 */
	replace(deadName: string, fresh: WorkerHandle): void {
		const index = this.workers.findIndex((w) => w.name === deadName);
		if (index !== -1) {
			this.workers.splice(index, 1);
		}
		fresh.busy = false;
		this.workers.push(fresh);
		this.pump();
	}

	/** Add a brand-new worker to the pool (e.g. staggered fan-out completion). */
	add(worker: WorkerHandle): void {
		if (this.workers.some((w) => w.name === worker.name)) {
			return;
		}
		worker.busy = false;
		this.workers.push(worker);
		this.pump();
	}

	/**
	 * Close the pool: reject every parked waiter. Called on teardown so an
	 * abandoned acquire never hangs forever.
	 */
	close(error?: Error): void {
		this.closed = true;
		const rejection =
			error ?? new Error("WorkerPool closed before a worker was available");
		while (this.waiters.length > 0) {
			const waiter = this.waiters.shift();
			waiter?.reject(rejection);
		}
	}

	/** Enqueue an acquire request, then try to satisfy it immediately. */
	private enqueue(
		opts: Pick<Waiter, "avoidName" | "strict">,
	): Promise<WorkerHandle> {
		if (this.closed) {
			return Promise.reject(
				new Error("WorkerPool is closed; cannot acquire a worker"),
			);
		}
		return new Promise<WorkerHandle>((resolve, reject) => {
			this.waiters.push({ resolve, reject, ...opts });
			this.pump();
		});
	}

	/**
	 * Grant workers to as many parked waiters as possible. Walks the waiter
	 * queue in FIFO order; a waiter is satisfied only if a compatible idle
	 * worker exists right now, otherwise it stays parked (so it doesn't starve a
	 * later, satisfiable waiter, we keep scanning the rest of the queue).
	 */
	private pump(): void {
		if (this.waiters.length === 0) {
			return;
		}

		const stillWaiting: Waiter[] = [];
		for (const waiter of this.waiters) {
			const worker = this.pickFor(waiter);
			if (worker) {
				worker.busy = true;
				waiter.resolve(worker);
			} else {
				stillWaiting.push(waiter);
			}
		}

		this.waiters.length = 0;
		this.waiters.push(...stillWaiting);
	}

	/**
	 * Choose the best idle worker for a waiter per the §8.7 policy, or
	 * `undefined` if none is currently available.
	 */
	private pickFor(waiter: Waiter): WorkerHandle | undefined {
		const idle = this.workers.filter((w) => !w.busy);
		if (idle.length === 0) {
			return undefined;
		}

		if (!waiter.avoidName) {
			return idle[0];
		}

		const different = idle.find((w) => w.name !== waiter.avoidName);
		if (different) {
			return different;
		}

		// Only the avoided worker is idle. In strict mode (worker-death) we may
		// still use it iff it's the ONLY live worker (N === 1); otherwise wait for
		// a different one to free up. In non-strict mode (retry) same-worker is an
		// acceptable fallback.
		const sameWorkerIsIdle = idle.some((w) => w.name === waiter.avoidName);
		if (!sameWorkerIsIdle) {
			return undefined;
		}
		if (waiter.strict && this.workers.length > 1) {
			return undefined;
		}
		return idle.find((w) => w.name === waiter.avoidName);
	}
}
