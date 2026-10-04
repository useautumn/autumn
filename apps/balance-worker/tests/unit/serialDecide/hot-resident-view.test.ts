/**
 * Serial-decide arm D: the hot path decides only on a view the ordinary path would have decided on. A command
 * whose entity rows are not resident goes to the ordinary path, which loads them; afterwards the hot answer and
 * the records it appends are the ordinary path's.
 */
import { describe, expect, test } from "bun:test";
import type {
	MeteringIdentity,
	TrackCommand,
	WorkerEntity,
} from "@autumn/balance-engine";
import type { MeteringRecord } from "@autumn/kafka";
import type { SubjectRowsEnvelope } from "@autumn/postgres";
import { AppEnv } from "@autumn/shared";
import { createBalanceWorkerApp } from "../../../src/http/createBalanceWorkerApp.js";
import type {
	BalanceWorkerHttpContext,
	BalanceWorkerRequestContext,
} from "../../../src/http/types/balanceWorkerHttp.js";
import type { PartitionProcessor } from "../../../src/processor/types/partitionProcessor.js";
import { createHotDecider } from "../../../src/serialDecide/createHotDecider.js";
import {
	HOT_KIND,
	type HotKind,
} from "../../../src/serialDecide/hotProtocol.js";
import { createPositionBoard } from "../../../src/serialDecide/positionBoard.js";
import type { WorkerDb } from "../../../src/types/workerDb.js";
import { createSyntheticWorkerDb } from "../../fixtures/catalog.js";
import {
	createCustomerEntitlement,
	createState,
	createTrackCommand,
	testIdentity,
	testOccurredAt,
	testOrg,
} from "../../fixtures/mutations.js";
import { createResidentProcessor } from "../../fixtures/residentProcessor.js";

const logger = { debug() {}, info() {}, warn() {}, error() {} };
const route = { partition: 0, routeEpoch: "1" };
const encoder = new TextEncoder();
const entityIdentity: MeteringIdentity = {
	...testIdentity,
	entityId: "ent_42",
};
const entity: WorkerEntity = {
	id: "ent_42",
	internal_id: "ent_internal_42",
	internal_customer_id: "cus_internal_1",
	feature_id: "seats",
};

/** Postgres as the worker sees it: the entity's own rows for ent_42, nothing else. */
const entityEnvelope: SubjectRowsEnvelope = {
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
	customer_entitlements: [
		{
			...createCustomerEntitlement({
				id: "seats_ent_42",
				featureId: "seats",
				balance: 50,
			}),
			internal_entity_id: entity.internal_id,
			feature_id: "seats",
			separate_interval: false,
			cache_version: 0,
		},
	],
	rollovers: [],
	replaceables: [],
	usage_windows: [],
	pooled_balances: [],
	customer_licenses: [],
	open_locks: [],
	entity: {
		...entity,
		org_id: testIdentity.orgId,
		created_at: 0,
		env: testIdentity.env,
		name: null,
		deleted: false,
		internal_feature_id: "feat_seats",
	},
};

const entityDb = (): WorkerDb => ({
	...createSyntheticWorkerDb(),
	getSubjectRows: async ({ identity }) =>
		identity.entityId === entity.id ? entityEnvelope : null,
	getEntitySubjectRows: async ({ entityIds }) =>
		entityIds.some((entityId) => entityId === entity.id)
			? [entityEnvelope]
			: [],
});

async function settled(): Promise<void> {
	for (let i = 0; i < 20; i++)
		await new Promise((resolve) => setImmediate(resolve));
}

function recordingAppender() {
	const appends: MeteringRecord[][] = [];
	let appended = 0n;
	return {
		appends,
		appender: {
			appendCommitted: async ({
				outcomes,
			}: {
				outcomes: readonly MeteringRecord[];
			}) => {
				appends.push([...outcomes]);
				const baseOffset = appended;
				appended += BigInt(outcomes.length);
				return { baseOffset };
			},
		},
	};
}

function contextFor({
	processor,
}: {
	processor: PartitionProcessor;
}): BalanceWorkerHttpContext {
	const runtime: BalanceWorkerRequestContext["runtime"] = {
		process: (run) => run(processor),
		processHot: (run) => run(processor),
	};
	return {
		ownership: { findRuntime: () => runtime },
		partitionResolver: { partitionForIdentity: () => 0 },
		logger,
	};
}

/** One partition as a worker serves it: the hot decider first, the ordinary handler for whatever it hands back. */
async function workerOf() {
	const log = recordingAppender();
	const board = createPositionBoard({ config: { partitionCount: 1 } });
	const db = entityDb();
	const processor = await createResidentProcessor({
		states: [createState({ identity: testIdentity, balance: 100 })],
		appender: log.appender,
		positions: board.sinkFor({ partition: 0 }),
		db,
	});
	await settled();
	log.appends.length = 0;
	const app = createBalanceWorkerApp({ ctx: contextFor({ processor }) });
	const decider = createHotDecider({
		ctx: contextFor({ processor }),
		config: { partitionCount: 1 },
	});
	async function viaClassic({
		path,
		body,
	}: {
		path: string;
		body: string;
	}): Promise<string> {
		const response = await app.fetch(
			new Request(`http://worker${path}`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body,
			}),
		);
		expect(response.status).toBe(200);
		return response.text();
	}
	function viaHot({ kind, body }: { kind: HotKind; body: string }) {
		return decider.decide({ kind, body: encoder.encode(body) });
	}
	return { log, decider, viaClassic, viaHot };
}

function checkBody({
	identity,
	requestId,
	featureId,
}: {
	identity: MeteringIdentity;
	requestId: string;
	featureId: string;
}): string {
	return JSON.stringify({
		route,
		command: {
			schemaVersion: 1,
			type: "check",
			org: testOrg,
			requestId,
			identity,
			featureId,
			internalFeatureId: `feat_${featureId}`,
			requiredBalance: 1,
			properties: null,
			occurredAt: testOccurredAt,
		},
	});
}

function batchBody({ commands }: { commands: TrackCommand[] }): string {
	return JSON.stringify({ route, commands });
}

const seats = ({ commandId }: { commandId: string }) =>
	createTrackCommand({
		identity: entityIdentity,
		featureId: "seats",
		commandId,
		value: 2,
	});

describe("hot path decides only on a resident view", () => {
	test("a check on an entity whose rows are not resident goes to the ordinary path, which loads them", async () => {
		const classic = await workerOf();
		const hot = await workerOf();
		const first = checkBody({
			identity: entityIdentity,
			requestId: "req_1",
			featureId: "seats",
		});
		const classicFirst = await classic.viaClassic({
			path: "/v1/check",
			body: first,
		});

		expect(hot.viaHot({ kind: HOT_KIND.CHECK, body: first })).toBeNull();
		expect(await hot.viaClassic({ path: "/v1/check", body: first })).toBe(
			classicFirst,
		);

		// The entity is resident now, so the hot path answers, as the ordinary path does.
		const second = checkBody({
			identity: entityIdentity,
			requestId: "req_2",
			featureId: "seats",
		});
		const hotSecond = hot.viaHot({ kind: HOT_KIND.CHECK, body: second });
		expect(hotSecond?.status).toBe(200);
		expect(hotSecond?.body).toBe(
			await classic.viaClassic({ path: "/v1/check", body: second }),
		);
	});

	test("a track batch for such an entity goes to the ordinary path whole, and the records match", async () => {
		const classic = await workerOf();
		const hot = await workerOf();
		const first = batchBody({ commands: [seats({ commandId: "t1" })] });
		const classicFirst = await classic.viaClassic({
			path: "/v1/track-batch",
			body: first,
		});

		expect(hot.viaHot({ kind: HOT_KIND.TRACK_BATCH, body: first })).toBeNull();
		expect(hot.decider.drainStats?.().fallbackBatches).toEqual({
			not_resident: 1,
		});
		expect(await hot.viaClassic({ path: "/v1/track-batch", body: first })).toBe(
			classicFirst,
		);

		const second = batchBody({ commands: [seats({ commandId: "t2" })] });
		const hotSecond = hot.viaHot({ kind: HOT_KIND.TRACK_BATCH, body: second });
		expect(hotSecond?.status).toBe(200);
		expect(hotSecond?.body).toBe(
			await classic.viaClassic({ path: "/v1/track-batch", body: second }),
		);
		await settled();
		expect(hot.log.appends.flat()).toEqual(classic.log.appends.flat());
		expect(hot.log.appends.flat()).toHaveLength(2);
	});
});
