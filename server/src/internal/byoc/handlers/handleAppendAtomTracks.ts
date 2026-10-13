import type { TrackCommand } from "@autumn/balance-engine";
import {
	AtomTracksAppendErrorCode,
	AtomTracksAppendRequestSchema,
} from "@autumn/byoc";
import type { Context } from "hono";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { rethrowBalanceWorkerError } from "@/internal/balances/balanceWorker/balanceWorkerErrors.js";
import { atomTracksToCommands } from "../actions/tracks/atomTracksToCommands.js";
import type { AtomHonoEnv } from "../types/atomHonoEnv.js";

/** An org's Atom hands in the deductions it granted; they are queued as a batch track is, and the worker dedups a resend. */
export async function handleAppendAtomTracks(c: Context<AtomHonoEnv>) {
	const parsed = AtomTracksAppendRequestSchema.safeParse(
		await c.req.json().catch(() => null),
	);
	const request = parsed.success ? parsed.data : null;
	const commands = request
		? atomTracksToCommands({ atom: c.get("atom"), request })
		: null;
	if (!request || !commands)
		return c.json(
			{
				code: AtomTracksAppendErrorCode.Unreadable,
				message: "Invalid request",
			},
			400,
		);
	const startedAt = performance.now();
	let queued = false;
	try {
		await getBalanceWorkerClient().queue.track({ commands });
		queued = true;
	} catch (cause) {
		rethrowBalanceWorkerError({ cause });
	} finally {
		logAtomTracksAppend({
			ctx: c.get("ctx"),
			atom: c.get("atom"),
			writer: request.writer,
			commands,
			queued,
			latencyMs: performance.now() - startedAt,
		});
	}
	return c.body(null, 204);
}

/** One line per hand-in: its size, seq range and how far its oldest deduction lags the Atom's answer. */
const logAtomTracksAppend = ({
	ctx,
	atom,
	writer,
	commands,
	queued,
	latencyMs,
}: {
	ctx: AutumnContext;
	atom: AtomHonoEnv["Variables"]["atom"];
	writer: string;
	commands: TrackCommand[];
	queued: boolean;
	latencyMs: number;
}) => {
	const seqs = commands.map(({ source }) => source?.seq ?? 0);
	const oldestAt = Math.min(...commands.map(({ occurredAt }) => occurredAt));
	ctx.logger.info("atom_tracks_append", {
		type: "atom_tracks_append",
		atom_id: atom.id,
		org_id: atom.orgId,
		env: atom.env,
		writer,
		tracks: commands.length,
		first_seq: commands.length ? Math.min(...seqs) : null,
		last_seq: commands.length ? Math.max(...seqs) : null,
		lag_ms: commands.length ? Date.now() - oldestAt : null,
		queued,
		latency_ms: Math.round(latencyMs),
	});
};
