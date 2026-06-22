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

	/** Max concurrent files per worker (`--per-worker`); a worker is available
	 * while `inFlight < slotsPerWorker`. */
	private readonly slotsPerWorker: number;

	constructor(workers: WorkerHandle[], slotsPerWorker = 1) {
		this.workers = [...workers];
		this.slotsPerWorker = Math.max(1, slotsPerWorker);
		for (const worker of this.workers) {
			worker.inFlight = 0;
		}
	}

	/** Current live worker count (busy + idle). */
	get size(): number {
		return this.workers.length;
	}

	/** Idle workers (no in-flight files) — candidates for culling. */
	get idleCount(): number {
		return this.workers.filter((w) => w.inFlight === 0).length;
	}

	/**
	 * Demand-tracked culling: remove up to `count` IDLE workers from the pool and
	 * return them (the caller terminates their sandboxes). Busy workers are never
	 * touched, and the pool is never shrunk below `keepMin` total — so retries /
	 * worker-death reschedules always have spare capacity. Synchronous (single-
	 * threaded), so a worker can't be granted to a waiter between the idle check and
	 * the removal.
	 */
	cullIdle(count: number, keepMin: number): WorkerHandle[] {
		if (count <= 0) {
			return [];
		}
		const idle = this.workers.filter((w) => w.inFlight === 0);
		const removable = Math.min(
			count,
			idle.length,
			Math.max(0, this.workers.length - keepMin),
		);
		const culled = idle.slice(0, removable);
		for (const worker of culled) {
			const index = this.workers.findIndex((w) => w.name === worker.name);
			if (index !== -1) {
				this.workers.splice(index, 1);
			}
		}
		return culled;
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

	/** Free one slot on a worker (a file finished) and admit the next waiter. */
	release(worker: WorkerHandle): void {
		worker.inFlight = Math.max(0, worker.inFlight - 1);
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
		fresh.inFlight = 0;
		this.workers.push(fresh);
		this.pump();
	}

	/** Add a brand-new worker to the pool (e.g. staggered fan-out completion). */
	add(worker: WorkerHandle): void {
		if (this.workers.some((w) => w.name === worker.name)) {
			return;
		}
		worker.inFlight = 0;
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
				worker.inFlight += 1;
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
		// A worker is available while it has a free slot (`--per-worker`). Among
		// available workers we pick the LEAST-loaded so files spread evenly instead
		// of piling K onto worker 1 before touching worker 2.
		const available = this.workers.filter(
			(w) => w.inFlight < this.slotsPerWorker,
		);
		if (available.length === 0) {
			return undefined;
		}

		if (!waiter.avoidName) {
			return leastLoaded(available);
		}

		const different = available.filter((w) => w.name !== waiter.avoidName);
		if (different.length > 0) {
			return leastLoaded(different);
		}

		// Only the avoided worker has a free slot. In strict mode (worker-death) we
		// may still use it iff it's the ONLY live worker (N === 1); otherwise wait
		// for a different one to free up. In non-strict mode (retry) same-worker is
		// an acceptable fallback.
		if (waiter.strict && this.workers.length > 1) {
			return undefined;
		}
		return leastLoaded(available);
	}
}

/** The worker with the fewest in-flight files (ties → first). Never empty. */
const leastLoaded = (workers: WorkerHandle[]): WorkerHandle =>
	workers.reduce((best, w) => (w.inFlight < best.inFlight ? w : best));
