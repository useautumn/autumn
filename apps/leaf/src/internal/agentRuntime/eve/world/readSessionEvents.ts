import { ms } from "@autumn/shared";
import { logger } from "../../../../lib/logger.js";
import { type EveEvent, parseEveEvent } from "../eveEventSchemas.js";
import { ndjsonLines } from "../ndjson.js";
import { journaledEventCount, resolveStreamName } from "./sessionStream.js";
import { requireWorkflowWorld } from "./workflowWorld.js";

const GAP_PROBE_INTERVAL_MS = ms.seconds(5);

/** The journal moved on while the live stream stayed quiet — a dead LISTEN
 * connection or a chunk dropped by ULID dedupe; reopening replays it. */
export class EveJournalGapError extends Error {
	constructor({
		cursor,
		sessionId,
		tail,
	}: {
		cursor: number;
		sessionId: string;
		tail: number;
	}) {
		super(
			`Eve journal for ${sessionId} is at ${tail} events but the live stream delivered ${cursor}`,
		);
		this.name = "EveJournalGapError";
	}
}

const raceWithIdle = async <Value>({
	idleMs,
	pending,
}: {
	idleMs: number;
	pending: Promise<Value>;
}): Promise<Value | "idle"> => {
	let idleTimer: ReturnType<typeof setTimeout> | undefined;
	const idle = new Promise<"idle">((resolve) => {
		idleTimer = setTimeout(() => resolve("idle"), idleMs);
	});
	return Promise.race([pending, idle]).finally(() => clearTimeout(idleTimer));
};

async function* chunksWithGapProbe({
	probeGap,
	reader,
}: {
	probeGap: () => Promise<void>;
	reader: ReadableStreamDefaultReader<Uint8Array>;
}): AsyncGenerator<Uint8Array> {
	while (true) {
		const pending = reader.read();
		let result = await raceWithIdle({ idleMs: GAP_PROBE_INTERVAL_MS, pending });
		while (result === "idle") {
			await probeGap();
			result = await raceWithIdle({ idleMs: GAP_PROBE_INTERVAL_MS, pending });
		}
		if (result.done) return;
		yield result.value;
	}
}

export async function* readSessionEvents({
	sessionId,
	signal,
	startIndex,
}: {
	sessionId: string;
	signal?: AbortSignal;
	startIndex: number;
}): AsyncGenerator<EveEvent> {
	const world = requireWorkflowWorld();
	const streamName = await resolveStreamName({ sessionId, world });
	const stream = await world.streams.get(sessionId, streamName, startIndex);
	const reader = stream.getReader();
	const abort = () => void reader.cancel().catch(() => undefined);
	signal?.addEventListener("abort", abort, { once: true });
	let cursor = startIndex;
	let delivered = false;
	const probeGap = async () => {
		// A fresh open replays the backlog from the cursor inside its first read,
		// so a quiet gap only means a lost notification once events have flowed.
		if (!delivered) return;
		const tail = await journaledEventCount({ sessionId, streamName, world });
		if (tail <= cursor) return;
		logger.warn("Eve journal moved on while the live stream stayed quiet", {
			event: "leaf.eve_journal_gap",
			data: { cursor, session_id: sessionId, tail },
		});
		throw new EveJournalGapError({ cursor, sessionId, tail });
	};
	try {
		for await (const line of ndjsonLines(
			chunksWithGapProbe({ probeGap, reader }),
		)) {
			cursor += 1;
			delivered = true;
			yield parseEveEvent(JSON.parse(line));
		}
	} finally {
		signal?.removeEventListener("abort", abort);
		abort();
	}
}
