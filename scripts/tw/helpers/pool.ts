import type { WorkerHandle } from "../types.ts";

type Waiter = {
	resolve: (worker: WorkerHandle) => void;
	reject: (error: Error) => void;
	avoidName?: string;
	strict: boolean;
	exclusive?: boolean;
};

export class WorkerPool {
	private readonly workers: WorkerHandle[];

	private readonly waiters: Waiter[] = [];

	private closed = false;

	private readonly slotsPerWorker: number;

	private readonly exclusiveHolders = new Set<string>();

	constructor(workers: WorkerHandle[], slotsPerWorker = 1) {
		this.workers = [...workers];
		this.slotsPerWorker = Math.max(1, slotsPerWorker);
		for (const worker of this.workers) {
			worker.inFlight = 0;
		}
	}

	get slots(): number {
		return this.slotsPerWorker;
	}

	get size(): number {
		return this.workers.length;
	}

	get idleCount(): number {
		return this.workers.filter((w) => w.inFlight === 0).length;
	}

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

	get all(): WorkerHandle[] {
		return [...this.workers];
	}

	acquire(): Promise<WorkerHandle> {
		return this.enqueue({ strict: false });
	}

	acquireDifferentFrom(
		lastWorkerName: string | undefined,
		strict = false,
		exclusive = false,
	): Promise<WorkerHandle> {
		return this.enqueue({ avoidName: lastWorkerName, strict, exclusive });
	}

	release(worker: WorkerHandle): void {
		worker.inFlight = this.exclusiveHolders.delete(worker.name)
			? 0
			: Math.max(0, worker.inFlight - 1);
		this.pump();
	}

	markDead(worker: WorkerHandle): void {
		this.exclusiveHolders.delete(worker.name);
		const index = this.workers.findIndex((w) => w.name === worker.name);
		if (index !== -1) {
			this.workers.splice(index, 1);
		}

		if (this.workers.length === 0 && this.waiters.length > 0) {
			const rejection = new Error(
				"WorkerPool exhausted: all workers died and none were replaced",
			);
			while (this.waiters.length > 0) {
				this.waiters.shift()?.reject(rejection);
			}
			return;
		}

		this.pump();
	}

	replace(deadName: string, fresh: WorkerHandle): void {
		const index = this.workers.findIndex((w) => w.name === deadName);
		if (index !== -1) {
			this.workers.splice(index, 1);
		}
		fresh.inFlight = 0;
		this.workers.push(fresh);
		this.pump();
	}

	add(worker: WorkerHandle): void {
		if (this.workers.some((w) => w.name === worker.name)) {
			return;
		}
		worker.inFlight = 0;
		this.workers.push(worker);
		this.pump();
	}

	close(error?: Error): void {
		this.closed = true;
		const rejection =
			error ?? new Error("WorkerPool closed before a worker was available");
		while (this.waiters.length > 0) {
			const waiter = this.waiters.shift();
			waiter?.reject(rejection);
		}
	}

	private enqueue(
		opts: Pick<Waiter, "avoidName" | "strict" | "exclusive">,
	): Promise<WorkerHandle> {
		if (this.closed) {
			return Promise.reject(
				new Error("WorkerPool is closed; cannot acquire a worker"),
			);
		}
		if (this.workers.length === 0) {
			return Promise.reject(
				new Error(
					"WorkerPool exhausted: all workers died and none were replaced",
				),
			);
		}
		return new Promise<WorkerHandle>((resolve, reject) => {
			this.waiters.push({ resolve, reject, ...opts });
			this.pump();
		});
	}

	private pump(): void {
		if (this.waiters.length === 0) {
			return;
		}
		const available = this.workers.filter(
			(w) => w.inFlight < this.slotsPerWorker,
		);
		if (available.length === 0) {
			return;
		}

		const stillWaiting: Waiter[] = [];
		for (const waiter of this.waiters) {
			const worker =
				available.length > 0 ? this.pickFrom(available, waiter) : undefined;
			if (!worker) {
				stillWaiting.push(waiter);
				continue;
			}
			if (waiter.exclusive) {
				worker.inFlight = this.slotsPerWorker;
				this.exclusiveHolders.add(worker.name);
			} else {
				worker.inFlight += 1;
			}
			if (worker.inFlight >= this.slotsPerWorker) {
				available.splice(available.indexOf(worker), 1);
			}
			waiter.resolve(worker);
		}

		this.waiters.length = 0;
		this.waiters.push(...stillWaiting);
	}

	private pickFrom(
		candidates: WorkerHandle[],
		waiter: Waiter,
	): WorkerHandle | undefined {
		let available = candidates;
		if (waiter.exclusive) {
			available = available.filter((w) => w.inFlight === 0);
			if (available.length === 0) return undefined;
		}

		if (!waiter.avoidName) {
			return leastLoaded(available);
		}

		const different = available.filter((w) => w.name !== waiter.avoidName);
		if (different.length > 0) {
			return leastLoaded(different);
		}

		if (waiter.strict && this.workers.length > 1) {
			return undefined;
		}
		return leastLoaded(available);
	}
}

const leastLoaded = (workers: WorkerHandle[]): WorkerHandle =>
	workers.reduce((best, w) => (w.inFlight < best.inFlight ? w : best));
