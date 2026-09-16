import type { CustomerMeteringState } from "@autumn/balance-engine";
import { assertPartition, assertTopic } from "../assertKafkaPosition.js";
import type { StateStoreContext } from "../types/stateStoreContext.js";
import {
	initializeParsedState,
	parsePersistedInitialization,
} from "./applyDurableMutations/applyStateInitialization.js";

export const restoreState = ({
	ctx,
	topic,
	partition,
	initializationId,
	state,
}: {
	ctx: StateStoreContext;
	topic: string;
	partition: number;
	initializationId: string;
	state: CustomerMeteringState;
}): void => {
	assertTopic({ topic });
	assertPartition({ partition });
	const persistedInitialization = parsePersistedInitialization({
		initialization: {
			schemaVersion: 1,
			type: "state_initialized",
			initializationId,
			initializedAt: 0,
			state,
		},
	});

	ctx.sqliteDb
		.transaction(() => {
			initializeParsedState({
				ctx,
				topic,
				partition,
				initialization: persistedInitialization,
			});
		})
		.immediate();
};
