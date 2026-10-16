export type SubjectLoadGate = {
	run<Value>(load: () => Promise<Value>): Promise<Value>;
	snapshot(): { running: number; queued: number };
};

/** The caller that queued this load stopped waiting before a slot freed, so it never ran. */
export class SubjectLoadShedError extends Error {
	constructor() {
		super("Subject load shed: its caller's deadline passed while it queued");
		this.name = "SubjectLoadShedError";
	}
}

type Waiter = { admit: () => void; shed: () => void };

/**
 * Newest first: past capacity a FIFO queue makes every caller wait out everyone ahead and miss its deadline,
 * where LIFO still answers as many as the slots can serve. A queued load is dropped at its caller's deadline.
 */
export function createSubjectLoadGate({
	config,
	ctx = {},
}: {
	config: { limit: number };
	ctx?: {
		now?: () => number;
		onAdmit?: (params: { waitMs: number }) => void;
		/** When the caller queuing a load stops waiting, on `performance.now()`'s clock; undefined never sheds. */
		readDeadline?: () => number | undefined;
	};
}): SubjectLoadGate {
	const now = ctx.now ?? (() => performance.now());
	const waiting: Waiter[] = [];
	let running = 0;

	function admit(): Promise<void> {
		const queuedAt = now();
		const reportWait = () => ctx.onAdmit?.({ waitMs: now() - queuedAt });
		if (running < config.limit) {
			running += 1;
			reportWait();
			return Promise.resolve();
		}
		const expiresAt = ctx.readDeadline?.();
		return new Promise<void>((resolve, reject) => {
			let timer: ReturnType<typeof setTimeout> | undefined;
			const waiter: Waiter = {
				admit: () => {
					clearTimeout(timer);
					reportWait();
					resolve();
				},
				shed: () => {
					waiting.splice(waiting.indexOf(waiter), 1);
					reject(new SubjectLoadShedError());
				},
			};
			waiting.push(waiter);
			if (expiresAt !== undefined)
				timer = setTimeout(
					waiter.shed,
					Math.max(expiresAt - performance.now(), 0),
				);
		});
	}

	function release(): void {
		const next = waiting.pop();
		if (next) next.admit();
		else running -= 1;
	}

	async function run<Value>(load: () => Promise<Value>): Promise<Value> {
		await admit();
		try {
			return await load();
		} finally {
			release();
		}
	}

	return {
		run,
		snapshot: () => ({ running, queued: waiting.length }),
	};
}
