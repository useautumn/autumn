import type {
	MigrationChunkDispatcher,
	StartedMigrationChunk,
} from "../types/migrationChunkDispatcher.js";
import type { MigrationChunkRunResult } from "../types/migrationChunkResult.js";
import type { RunMigrationChunkPayload } from "../types/migrationRunPayloads.js";

type ChunkCustomers = RunMigrationChunkPayload["customers"];

type InFlightChunk = {
	pageIndex: number;
	attempt: number;
	customers: ChunkCustomers;
	started: StartedMigrationChunk;
};

/** The parent loop: keep `concurrency` chunks running, one customer page each,
 * polling between refills. A chunk that fails is retried once with the same page. */
export const scheduleMigrationChunks = async ({
	pages,
	concurrency,
	isCancelRequested,
	buildPayload,
	dispatcher,
}: {
	pages: AsyncIterable<ChunkCustomers>;
	concurrency: number;
	isCancelRequested: () => Promise<boolean>;
	buildPayload: (chunk: {
		pageIndex: number;
		attempt: number;
		customers: ChunkCustomers;
	}) => RunMigrationChunkPayload;
	dispatcher: MigrationChunkDispatcher;
}): Promise<MigrationChunkRunResult> => {
	const source = pages[Symbol.asyncIterator]();
	const inFlight: InFlightChunk[] = [];
	const failedPages: number[] = [];
	let nextPageIndex = 0;
	let pagesExhausted = false;
	let processed = 0;
	let chunks = 0;
	let canceled = false;

	const startChunk = async (chunk: Omit<InFlightChunk, "started">) => {
		const started = await dispatcher.start(buildPayload(chunk));
		inFlight.push({ ...chunk, started });
		chunks++;
	};

	const fillFreeSlots = async () => {
		while (!canceled && !pagesExhausted && inFlight.length < concurrency) {
			const page = await source.next();
			if (page.done) {
				pagesExhausted = true;
				return;
			}
			await startChunk({
				pageIndex: nextPageIndex++,
				attempt: 1,
				customers: page.value,
			});
		}
	};

	const settleFinishedChunks = async () => {
		for (const chunk of [...inFlight]) {
			const outcome = await chunk.started.poll();
			if (!outcome) continue;
			inFlight.splice(inFlight.indexOf(chunk), 1);
			if (outcome.ok) {
				processed += outcome.result.processed;
			} else if (chunk.attempt === 1) {
				await startChunk({ ...chunk, attempt: 2 });
			} else {
				failedPages.push(chunk.pageIndex);
			}
		}
	};

	while (true) {
		canceled ||= await isCancelRequested();
		await fillFreeSlots();
		if (inFlight.length === 0) break;
		await dispatcher.idle();
		await settleFinishedChunks();
	}

	if (failedPages.length > 0) {
		throw new Error(
			`Migration chunks failed twice for pages ${failedPages.join(", ")}`,
		);
	}
	return { processed, chunks, canceled };
};
