type BatchSettled<Item, Result> = (args: {
	batch: Item[];
	results: Result[];
}) => Promise<void> | void;

type PendingBatch<Item, Result> = {
	batch: Item[];
	settled: Array<Result>;
	remaining: number;
	reported: boolean;
};

/** One pool spanning every batch: a slow item holds a single slot rather than
 * stalling its whole batch, and slots stay full while batches are sparse. */
export const mapStreamWithConcurrency = async function* <Item, Result>({
	batches,
	concurrency,
	run,
	onBatchSettled,
}: {
	batches: AsyncGenerator<Item[]>;
	concurrency: number;
	run: (item: Item) => Promise<Result>;
	onBatchSettled?: BatchSettled<Item, Result>;
}): AsyncGenerator<Result> {
	const slots = Math.max(1, concurrency);
	const inFlight = new Map<number, Promise<number>>();
	const pending: Array<{ token: number; result: Result }> = [];
	const order: Array<PendingBatch<Item, Result>> = [];
	let nextToken = 0;
	let failure: unknown;

	const start = ({
		item,
		owner,
	}: {
		item: Item;
		owner: PendingBatch<Item, Result>;
	}) => {
		const token = nextToken++;
		inFlight.set(
			token,
			run(item)
				.then((result) => {
					pending.push({ token, result });
					owner.settled.push(result);
					return token;
				})
				.catch((error) => {
					failure ??= error;
					return token;
				})
				.finally(() => {
					owner.remaining--;
				}),
		);
	};

	const settleReportableBatches = async () => {
		while (order.length > 0) {
			const head = order[0];
			if (head.remaining > 0 || head.reported) break;
			head.reported = true;
			order.shift();
			await onBatchSettled?.({ batch: head.batch, results: head.settled });
		}
	};

	const drainOne = async () => {
		const token = await Promise.race(inFlight.values());
		inFlight.delete(token);
	};

	for await (const batch of batches) {
		if (failure) break;

		const owner: PendingBatch<Item, Result> = {
			batch,
			settled: [],
			remaining: batch.length,
			reported: false,
		};
		order.push(owner);

		if (batch.length === 0) {
			await settleReportableBatches();
			continue;
		}

		for (const item of batch) {
			if (failure) break;
			start({ item, owner });
			while (inFlight.size >= slots && !failure) {
				await drainOne();
				yield* pending.splice(0).map(({ result }) => result);
				await settleReportableBatches();
			}
		}
	}

	while (inFlight.size > 0) {
		await drainOne();
		yield* pending.splice(0).map(({ result }) => result);
		await settleReportableBatches();
	}

	yield* pending.splice(0).map(({ result }) => result);
	await settleReportableBatches();

	if (failure) throw failure;
};
