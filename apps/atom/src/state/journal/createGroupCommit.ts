/** Appends behind the first get this long to join its commit, so a commit's fixed cost is shared by a burst, not paid per pair. */
const LINGER_MS = 1;
/** A batch this full commits at once: nothing is gained by waiting for more. */
export const MAX_GATHERED = 500;

const lingerOf = () => Bun.sleep(LINGER_MS);
/** One step of the event loop: appends already on their way to this thread join the commit about to start. */
const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

type Waiting<Item> = {
	item: Item;
	resolve: () => void;
	reject: (error: unknown) => void;
};

/**
 * Commits items in batches, one at a time: what arrives while a commit lingers or is in flight goes in it or the next,
 * so a burst costs one transaction, not one each. Each `add` resolves only once its own batch has committed.
 */
export const createGroupCommit = <Item>({
	commit,
	linger = lingerOf,
}: {
	/** Commits every item or none. */
	commit: (items: Item[]) => void | Promise<void>;
	/** How a batch waits for the appends behind its first; a test ends it by hand. */
	linger?: () => Promise<void>;
}): { add(item: Item): Promise<void> } => {
	let queued: Waiting<Item>[] = [];
	let flushing = false;

	async function flush(): Promise<void> {
		flushing = true;
		while (queued.length > 0) {
			await nextTurn();
			if (queued.length < MAX_GATHERED) await linger();
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
