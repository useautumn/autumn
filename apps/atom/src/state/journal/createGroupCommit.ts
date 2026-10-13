/** One step of the event loop: appends already on their way to this thread join the commit about to start. */
const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

type Waiting<Item> = {
	item: Item;
	resolve: () => void;
	reject: (error: unknown) => void;
};

/**
 * Commits items in batches, one at a time: what arrives while a commit is in flight goes in the next, so a burst
 * costs one transaction, not one each. Each `add` resolves only once its own batch has committed.
 */
export const createGroupCommit = <Item>({
	commit,
}: {
	/** Commits every item or none. */
	commit: (items: Item[]) => void | Promise<void>;
}): { add(item: Item): Promise<void> } => {
	let queued: Waiting<Item>[] = [];
	let flushing = false;

	async function flush(): Promise<void> {
		flushing = true;
		while (queued.length > 0) {
			await nextTurn();
			const batch = queued;
			queued = [];
			try {
				await commit(batch.map(({ item }) => item));
				for (const waiting of batch) waiting.resolve();
			} catch (error) {
				for (const waiting of batch) waiting.reject(error);
			}
		}
		flushing = false;
	}

	function add(item: Item): Promise<void> {
		const { promise, resolve, reject } = Promise.withResolvers<void>();
		queued.push({ item, resolve, reject });
		if (!flushing) void flush();
		return promise;
	}

	return { add };
};
