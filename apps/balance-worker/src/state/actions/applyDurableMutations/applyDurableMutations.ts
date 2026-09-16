import { parseTrackOutcome } from "@autumn/balance-engine";
import {
	assertOffset,
	assertPartition,
	assertTopic,
} from "../../assertKafkaPosition.js";
import type {
	DurableMutationApplyResult,
	DurableMutationRecord,
} from "../../types/durableMutation.js";
import type { StateStoreContext } from "../../types/stateStoreContext.js";
import {
	applyStateInitialization,
	parsePersistedInitialization,
} from "./applyStateInitialization.js";
import { applyTrackOutcome } from "./applyTrackOutcome.js";

/** Applies a committed batch of mixed records in one transaction, in log order. */
export const applyDurableMutations = ({
	ctx,
	records,
}: {
	ctx: StateStoreContext;
	records: readonly DurableMutationRecord[];
}): DurableMutationApplyResult[] => {
	const parsedRecords: DurableMutationRecord[] = [];
	for (const { position, mutation } of records) {
		assertTopic({ topic: position.topic });
		assertPartition({ partition: position.partition });
		assertOffset({ offset: position.offset });
		parsedRecords.push({
			position,
			mutation:
				mutation.type === "state_initialized"
					? parsePersistedInitialization({ initialization: mutation })
					: parseTrackOutcome({ input: mutation }),
		});
	}
	if (parsedRecords.length === 0) return [];

	return ctx.sqliteDb
		.transaction(() => {
			const results: DurableMutationApplyResult[] = [];
			for (const { position, mutation } of parsedRecords) {
				if (mutation.type === "state_initialized") {
					const initialized = applyStateInitialization({
						ctx,
						position,
						initialization: mutation,
					});
					results.push(
						initialized.kind === "position_already_applied"
							? initialized
							: { type: "state_initialized", ...initialized },
					);
					continue;
				}
				const tracked = applyTrackOutcome({ ctx, position, outcome: mutation });
				results.push(
					tracked.kind === "position_already_applied"
						? tracked
						: { type: "track_outcome", ...tracked },
				);
			}
			return results;
		})
		.immediate();
};
