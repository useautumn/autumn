import {
	AtomTracksAppendErrorCode,
	AtomTracksAppendRequestSchema,
} from "@autumn/byoc";
import type { Context } from "hono";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import { rethrowBalanceWorkerError } from "@/internal/balances/balanceWorker/balanceWorkerErrors.js";
import { atomTracksToCommands } from "../actions/tracks/atomTracksToCommands.js";
import type { AtomHonoEnv } from "../types/atomHonoEnv.js";

/** An org's Atom hands in the deductions it granted; they are queued as a batch track is, and the worker dedups a resend. */
export async function handleAppendAtomTracks(c: Context<AtomHonoEnv>) {
	const parsed = AtomTracksAppendRequestSchema.safeParse(
		await c.req.json().catch(() => null),
	);
	const commands = parsed.success
		? atomTracksToCommands({
				ctx: c.get("ctx"),
				atom: c.get("atom"),
				request: parsed.data,
			})
		: null;
	if (!commands)
		return c.json(
			{
				code: AtomTracksAppendErrorCode.Unreadable,
				message: "Invalid request",
			},
			400,
		);
	try {
		// One append keeps a lock's track ahead of its finalize.
		await getBalanceWorkerClient().enqueue({ commands });
	} catch (cause) {
		rethrowBalanceWorkerError({ cause });
	}
	return c.body(null, 204);
}
