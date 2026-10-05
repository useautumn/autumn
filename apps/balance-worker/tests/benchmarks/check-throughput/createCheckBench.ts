import type { CheckCommand, MeteringIdentity } from "@autumn/balance-engine";
import type { SubjectRowsEnvelope } from "@autumn/postgres";
import { AppEnv } from "@autumn/shared";
import { createBalanceWorkerApp } from "../../../src/http/createBalanceWorkerApp.js";
import type { BalanceWorkerRequestContext } from "../../../src/http/types/balanceWorkerHttp.js";
import { getBalanceWorkerLogger } from "../../../src/logging/getBalanceWorkerLogger.js";
import { processCommand } from "../../../src/runtime/processCommand.js";
import type { PartitionRuntimeScope } from "../../../src/runtime/types/partitionRuntimeState.js";
import type { WorkerDb } from "../../../src/types/workerDb.js";
import { createSyntheticWorkerDb } from "../../fixtures/catalog.js";
import {
	createInitializeRequest,
	testIdentity,
	testOrg,
} from "../../fixtures/mutations.js";
import { createBenchProcessor } from "../track-throughput/createBenchProcessor.js";
import type { Scenario } from "../track-throughput/scenarios.js";

/** Production samples 5% of successful request lines. */
const REQUEST_LOG_SAMPLE_RATE = 0.05;

/** An entity with no rows of its own: its checks are funded by the customer's plans, as the hot prod pattern is. */
const entityEnvelopeOf = ({
	entityId,
}: {
	entityId: string;
}): SubjectRowsEnvelope => ({
	customer: {
		internal_id: "cus_internal_1",
		id: testIdentity.customerId,
		org_id: testIdentity.orgId,
		env: AppEnv.Sandbox,
		created_at: 0,
		processor: null,
		metadata: null,
		send_email_receipts: false,
		config: null,
		spend_limits: null,
		overage_allowed: null,
		usage_limits: null,
	},
	customer_products: [],
	customer_prices: [],
	customer_entitlements: [],
	rollovers: [],
	replaceables: [],
	usage_windows: [],
	pooled_balances: [],
	customer_licenses: [],
	open_locks: [],
	entity: {
		id: entityId,
		internal_id: `${entityId}_internal`,
		internal_customer_id: "cus_internal_1",
		feature_id: "seats",
		org_id: testIdentity.orgId,
		created_at: 0,
		env: testIdentity.env,
		name: null,
		deleted: false,
		internal_feature_id: "feat_seats",
	},
});

const createEntityBenchDb = (): WorkerDb => ({
	...createSyntheticWorkerDb(),
	getEntitySubjectRows: async ({ entityIds }) =>
		entityIds.map((entityId) => entityEnvelopeOf({ entityId })),
});

/** One resident customer on a real partition processor, behind the runtime's gate and the worker's real Hono app. */
export const createCheckBench = async ({
	scenario,
}: {
	scenario: Scenario;
}) => {
	const bench = await createBenchProcessor({
		scenario,
		partition: 0,
		latency: { appendMs: 0, applyMs: 0 },
		serialize: true,
		db: createEntityBenchDb(),
	});
	await bench.processor.initialize({
		request: createInitializeRequest({
			state: scenario.stateFor({ identity: testIdentity }),
		}),
	});

	// A ready runtime reads only its processor and terminal state; the rest is never touched.
	const runtimeScope = {
		ctx: { processor: bench.processor, config: {} },
		state: {
			status: "ready",
			terminalError: null,
			requestCounters: { droppedPastDeadline: 0 },
		},
	} as unknown as PartitionRuntimeScope;
	const runtime: BalanceWorkerRequestContext["runtime"] = {
		process: (run, options) =>
			processCommand({ ...runtimeScope, run, ...options }),
	};
	const app = createBalanceWorkerApp({
		ctx: {
			ownership: { findRuntime: () => runtime },
			partitionResolver: { partitionForIdentity: () => 0 },
			logger: getBalanceWorkerLogger(),
			requestLog: { successSampleRate: REQUEST_LOG_SAMPLE_RATE },
		},
	});

	return { processor: bench.processor, app };
};

/** The command the server sends for a plain check, stamped with the moment it is sent. */
export const createBenchCheckCommand = ({
	identity,
	featureId,
	sequence,
}: {
	identity: MeteringIdentity;
	featureId: string;
	sequence: number;
}): CheckCommand => ({
	schemaVersion: 1,
	type: "check",
	org: testOrg,
	requestId: `req_check_${sequence}`,
	identity,
	featureId,
	internalFeatureId: `feat_${featureId}`,
	requiredBalance: 1,
	properties: null,
	occurredAt: Date.now(),
});

export const benchIdentityOf = ({
	entityId,
}: {
	entityId: string | null;
}): MeteringIdentity => ({ ...testIdentity, entityId });
