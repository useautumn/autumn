import { createWorld } from "@workflow/world-postgres";
import { logger } from "../../../lib/logger.js";
import { type EveEvent, parseEveEvent } from "./eveEventSchemas.js";

type WorkflowWorld = ReturnType<typeof createWorld>;

const worldConnectionString = () =>
	process.env.WORKFLOW_POSTGRES_URL ?? process.env.CHAT_DATABASE_URL;

let world: WorkflowWorld | undefined;

/** The durable journal eve writes to — the same Postgres the HTTP stream is a
 * passthrough of. Never `start()`ed: leaf only reads, it never runs the queue. */
const workflowWorld = (): WorkflowWorld | undefined => {
	const connectionString = worldConnectionString();
	if (!connectionString) return undefined;
	world ??= createWorld({
		connectionString,
		namespace: process.env.WORKFLOW_QUEUE_NAMESPACE,
	});
	return world;
};

export const hasWorkflowWorld = () => Boolean(worldConnectionString());

/** eve names a session's event stream after its run id. */
export const sessionStreamName = (sessionId: string) =>
	`${sessionId.replace(/^wrun_/, "strm_")}_user`;

const resolveStreamName = async ({
	sessionId,
	streams,
}: {
	sessionId: string;
	streams: WorkflowWorld["streams"];
}) => {
	const expected = sessionStreamName(sessionId);
	const names = await streams.list(sessionId).catch(() => [] as string[]);
	if (names.includes(expected) || names.length === 0) return expected;
	const userStream = names.find((name) => name.endsWith("_user"));
	if (userStream && userStream !== expected) {
		logger.warn("Eve session stream name differs from the expected form", {
			event: "leaf.eve_stream_name_mismatch",
			data: { expected, found: userStream, session_id: sessionId },
		});
	}
	return userStream ?? expected;
};

/** Number of events eve has journaled for the session — the exact cursor. */
export const sessionEventCount = async (
	sessionId: string,
): Promise<number | undefined> => {
	const current = workflowWorld();
	if (!current) return undefined;
	const name = await resolveStreamName({ sessionId, streams: current.streams });
	const info = await current.streams.getInfo(sessionId, name);
	return info.tailIndex + 1;
};

const GAP_PROBE_INTERVAL_MS = 5_000;

/** The journal moved on while the live stream stayed quiet: either the
 * LISTEN connection died, or a chunk arrived out of ULID order and the
 * reader's dedupe dropped it. Reopening from the cursor replays it in order. */
export class EveJournalGapError extends Error {
	constructor(sessionId: string, cursor: number, tail: number) {
		super(
			`Eve journal for ${sessionId} is at ${tail} events but the live stream delivered ${cursor}`,
		);
		this.name = "EveJournalGapError";
	}
}

/** Tails the session journal from Postgres (LISTEN/NOTIFY, no HTTP socket). */
export async function* readSessionEvents({
	sessionId,
	signal,
	startIndex,
}: {
	sessionId: string;
	signal?: AbortSignal;
	startIndex: number;
}): AsyncGenerator<EveEvent> {
	const current = workflowWorld();
	if (!current) throw new Error("No workflow world is configured");
	const name = await resolveStreamName({ sessionId, streams: current.streams });
	const stream = await current.streams.get(sessionId, name, startIndex);
	const reader = stream.getReader();
	const abort = () => void reader.cancel().catch(() => undefined);
	signal?.addEventListener("abort", abort, { once: true });
	const decoder = new TextDecoder();
	let buffer = "";
	let cursor = startIndex;
	const probeGap = async () => {
		const info = await current.streams.getInfo(sessionId, name);
		if (info.tailIndex + 1 > cursor) {
			throw new EveJournalGapError(sessionId, cursor, info.tailIndex + 1);
		}
	};
	const readOrProbe = async () => {
		while (true) {
			const timeout = new Promise<"idle">((resolve) =>
				setTimeout(() => resolve("idle"), GAP_PROBE_INTERVAL_MS),
			);
			const result = await Promise.race([reader.read(), timeout]);
			if (result !== "idle") return result;
			await probeGap();
		}
	};
	try {
		while (true) {
			const { done, value } = await readOrProbe();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			let newlineIndex = buffer.indexOf("\n");
			while (newlineIndex >= 0) {
				const line = buffer.slice(0, newlineIndex).trim();
				buffer = buffer.slice(newlineIndex + 1);
				newlineIndex = buffer.indexOf("\n");
				if (line) {
					cursor += 1;
					yield parseEveEvent(JSON.parse(line));
				}
			}
		}
	} finally {
		signal?.removeEventListener("abort", abort);
		abort();
	}
}

/** Whether eve still holds the session's delivery hook — false means a
 * message post would silently start a new run under the same token. */
export const isContinuationTokenAlive = async (
	token: string,
): Promise<boolean | undefined> => {
	const current = workflowWorld();
	if (!current) return undefined;
	try {
		await current.hooks.getByToken(token);
		return true;
	} catch (error) {
		if (isNotFound(error)) return false;
		throw error;
	}
};

/** Cancels the run behind an abandoned session so its hooks and parks are
 * released instead of leaking. Best effort. */
export const cancelSessionRun = async (sessionId: string) => {
	const current = workflowWorld();
	if (!current) return false;
	try {
		const run = await current.runs.get(sessionId, { resolveData: "none" });
		await current.events.create(sessionId, {
			eventType: "run_cancelled",
			specVersion: run.specVersion ?? 1,
		} as Parameters<typeof current.events.create>[1]);
		return true;
	} catch (error) {
		if (isNotFound(error)) return false;
		logger.warn("Could not cancel the eve run behind an abandoned session", {
			event: "leaf.eve_run_cancel_failed",
			data: { error: String(error), session_id: sessionId },
		});
		return false;
	}
};

const isNotFound = (error: unknown) =>
	error instanceof Error &&
	/not found|404|does not exist/i.test(`${error.name} ${error.message}`);
