import {
	type AutoTopupDispatchContext,
	dispatchAutoTopup,
} from "@autumn/auto-topup";
import type {
	StreamConsumer,
	StreamRecord,
} from "../../stream/types/streamConsumer.js";
import { recordToAutoTopupPayloads } from "./actions/recordToAutoTopupPayloads.js";

/** Runs the auto top-up jobs each record calls for; the pending key makes a replayed record, or a burst, one job. */
export function createAutoTopupsConsumer({
	ctx,
}: {
	ctx: AutoTopupDispatchContext;
}): StreamConsumer {
	async function handle({
		records,
	}: {
		records: StreamRecord[];
	}): Promise<void> {
		for (const { record } of records) {
			for (const payload of recordToAutoTopupPayloads({ record })) {
				await dispatchAutoTopup({ ctx, payload });
			}
		}
	}

	return { name: "auto-topups", handle };
}
