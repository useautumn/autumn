import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type CustomerMeteringState,
	computeTrack,
	createCustomerMeteringState,
	parseTrackCommand,
	type TrackOutcome,
} from "@autumn/balance-engine";
import {
	openSqliteBalanceStateStore,
	type SqliteBalanceStateStore,
} from "../../../src/state/sqliteBalanceStateStore.js";

export const identity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
} as const;

export const topic = "metering-events-v1";
export const partition = 0;

export const createState = ({
	balance = 10,
}: {
	balance?: number;
} = {}): CustomerMeteringState =>
	createCustomerMeteringState({
		identity,
		featureStatesById: {
			messages: {
				kind: "direct_metered_v1",
				customerEntitlements: [{ id: "messages_monthly", balance, usage: 0 }],
			},
		},
	});

export const createOutcome = ({
	state,
	commandId = "cmd_1",
	requestId = "req_1",
}: {
	state: CustomerMeteringState;
	commandId?: string;
	requestId?: string;
}): TrackOutcome => {
	const decision = computeTrack({
		state,
		command: parseTrackCommand({
			input: {
				schemaVersion: 1,
				type: "track",
				commandId,
				requestId,
				identity: state.identity,
				entityId: null,
				featureId: "messages",
				value: 5,
				overageBehavior: "reject",
				properties: null,
				occurredAt: 1_700_000_000_000,
			},
		}),
	});

	if (decision.kind !== "new") {
		throw new Error(`Expected a new outcome, received ${decision.kind}`);
	}
	return decision.outcome;
};

export const createStoreFixture = ({
	nextOffset = 0n,
}: {
	nextOffset?: bigint;
} = {}): {
	directory: string;
	store: SqliteBalanceStateStore;
} => {
	const directory = mkdtempSync(join(tmpdir(), "autumn-kafka-consumer-"));
	const store = openSqliteBalanceStateStore({
		databasePath: join(directory, "balance-state.sqlite"),
	});

	try {
		store.initializePartition({ topic, partition, nextOffset });
		return { directory, store };
	} catch (error) {
		store.close();
		rmSync(directory, { recursive: true, force: true });
		throw error;
	}
};

export const closeStoreFixture = ({
	directory,
	store,
}: {
	directory: string;
	store: SqliteBalanceStateStore;
}): void => {
	store.close();
	rmSync(directory, { recursive: true, force: true });
};
