export type SubjectLoadGate = {
	run<Value>(load: () => Promise<Value>): Promise<Value>;
	snapshot(): { running: number; queued: number };
};

export function createSubjectLoadGate({
	config,
	ctx = {},
}: {
	config: { limit: number };
	ctx?: {
		now?: () => number;
		onAdmit?: (params: { waitMs: number }) => void;
	};
}): SubjectLoadGate {
	const now = ctx.now ?? (() => performance.now());
	const waiting: (() => void)[] = [];
	let running = 0;

	function admit(): Promise<void> {
		const queuedAt = now();
		const reportWait = () => ctx.onAdmit?.({ waitMs: now() - queuedAt });
		if (running < config.limit) {
			running += 1;
			reportWait();
			return Promise.resolve();
		}
		return new Promise<void>((resolve) => {
			waiting.push(() => {
				reportWait();
				resolve();
			});
		});
	}

	function release(): void {
		const next = waiting.shift();
		if (next) next();
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
