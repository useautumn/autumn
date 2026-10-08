import { describe, expect, test } from "bun:test";
import {
	computeCheck,
	type MeteringIdentity,
	mergeSubjectStates,
	meteringIdentityToPartitionKey,
	meteringIdentityToSubjectKey,
	parseCheckCommand,
	type SubjectState,
	slimSubjectForFeatures,
} from "@autumn/balance-engine";
import { BALANCE_WORKER_SUBJECT_MAP_MEMORY_FRACTION } from "@autumn/env/balanceWorkerConstants";
import type { SubjectRowsEnvelope } from "@autumn/postgres";
import { AppEnv } from "@autumn/shared";
import { createSubjectHydrator } from "../../../../src/processor/subject/createSubjectHydrator.js";
import type { SubjectHydrator } from "../../../../src/processor/subject/types/subjectHydrator.js";
import {
	createSubjectMap,
	SUBJECT_MAP_MAX_BYTES,
} from "../../../../src/processor/writer/subjectMap/createSubjectMap.js";
import {
	createSubjectMapBudget,
	subjectMapBudgetBytesOf,
} from "../../../../src/processor/writer/subjectMap/createSubjectMapBudget.js";
import type { PartitionWriter } from "../../../../src/processor/writer/types/partitionWriter.js";
import {
	createSyntheticWorkerDb,
	createTestCatalogCache,
} from "../../../fixtures/catalog.js";
import {
	createCustomerEntitlement,
	testIdentity as identity,
	testOccurredAt,
	testOrg,
} from "../../../fixtures/mutations.js";

const featureId = "AI_CREDITS";
const customerRow = {
	internal_id: "cus_internal_1",
	id: identity.customerId,
	org_id: identity.orgId,
	env: AppEnv.Sandbox,
	created_at: testOccurredAt,
	processor: null,
	metadata: null,
	send_email_receipts: false,
	config: null,
	spend_limits: null,
	overage_allowed: null,
	usage_limits: null,
	usage_alerts: null,
};

const entityIdOf = ({ index }: { index: number }) => `ent_${index}`;

const entitlementRow = ({
	id,
	feature,
	internalEntityId,
}: {
	id: string;
	feature: string;
	internalEntityId: string | null;
}) => ({
	...createCustomerEntitlement({ id, featureId: feature, balance: 1_000 }),
	customer_product_id: null,
	internal_entity_id: internalEntityId,
	feature_id: feature,
	separate_interval: false,
	cache_version: 0,
});

const envelopeOf = ({
	customerEntitlements,
	entity,
}: {
	customerEntitlements: SubjectRowsEnvelope["customer_entitlements"];
	entity: SubjectRowsEnvelope["entity"];
}): SubjectRowsEnvelope => ({
	customer: customerRow,
	customer_products: [],
	customer_prices: [],
	customer_entitlements: customerEntitlements,
	rollovers: [],
	replaceables: [],
	usage_windows: [],
	pooled_balances: [],
	customer_licenses: [],
	open_locks: [],
	entity,
});

const customerEnvelope = envelopeOf({
	customerEntitlements: [
		entitlementRow({
			id: "messages_monthly",
			feature: "messages",
			internalEntityId: null,
		}),
	],
	entity: null,
});

const entityEnvelopeOf = ({
	index,
}: {
	index: number;
}): SubjectRowsEnvelope => {
	const id = entityIdOf({ index });
	const internalId = `ent_internal_${index}`;
	return envelopeOf({
		customerEntitlements: [
			entitlementRow({
				id: `ai_credits_${index}`,
				feature: featureId,
				internalEntityId: internalId,
			}),
		],
		entity: {
			id,
			internal_id: internalId,
			internal_customer_id: customerRow.internal_id,
			feature_id: "projects",
			org_id: identity.orgId,
			created_at: testOccurredAt,
			env: identity.env,
			name: null,
			deleted: false,
			internal_feature_id: "feat_projects",
		},
	});
};

/** Residency exactly as the partition writer keeps it: one subject map, customer and entity slices merged on read. */
const createMapWriter = ({
	maxBytes,
}: {
	maxBytes: number | (() => number);
}) => {
	const map = createSubjectMap({ maxBytes });
	const readFreshestState = ({
		identity: subjectIdentity,
	}: {
		identity: MeteringIdentity;
	}): SubjectState | null => {
		const customer = map.readState({
			subjectKey: meteringIdentityToSubjectKey({
				identity: { ...subjectIdentity, entityId: null },
			}),
		});
		if (!customer) return null;
		const entity = subjectIdentity.entityId
			? map.readState({
					subjectKey: meteringIdentityToSubjectKey({
						identity: subjectIdentity,
					}),
				})
			: null;
		return mergeSubjectStates({ customer, entity });
	};
	const adopt = ({ state }: { state: SubjectState }): SubjectState => {
		map.setState({
			subjectKey: meteringIdentityToSubjectKey({ identity: state.identity }),
			customerKey: meteringIdentityToPartitionKey({
				identity: state.identity,
			}),
			state,
		});
		return state;
	};
	const decide: PartitionWriter["decide"] = () => {
		throw new Error("Postgres is the baseline here; hydration decides nothing");
	};
	return {
		writer: {
			decide,
			readFreshestState,
			adopt,
			waitForCommittedToStore: () => null,
		},
		map,
	};
};

const createCustomer = ({
	entities,
	maxBytes,
}: {
	entities: number;
	maxBytes: number | (() => number);
}) => {
	const envelopes = new Map<string, SubjectRowsEnvelope>();
	for (let index = 0; index < entities; index++) {
		envelopes.set(entityIdOf({ index }), entityEnvelopeOf({ index }));
	}
	let loads = 0;
	let entityLoads = 0;
	let gate: Promise<void> | null = null;
	const db = {
		...createSyntheticWorkerDb(),
		getSubjectRows: async ({
			identity: subjectIdentity,
		}: {
			identity: MeteringIdentity;
		}) => {
			loads += 1;
			if (!subjectIdentity.entityId) return customerEnvelope;
			return envelopes.get(subjectIdentity.entityId) ?? null;
		},
		getEntitySubjectRows: async ({
			entityIds,
		}: {
			identity: MeteringIdentity;
			entityIds: readonly string[];
			asOfTimestampMs: number;
		}) => {
			loads += 1;
			entityLoads += 1;
			if (gate) await gate;
			return entityIds.flatMap((entityId) => {
				const envelope = envelopes.get(entityId);
				return envelope ? [envelope] : [];
			});
		},
	};
	const { writer, map } = createMapWriter({ maxBytes });
	const hydrator = createSubjectHydrator({
		ctx: {
			catalogCache: createTestCatalogCache({ db }),
			db,
			writer,
			receiptPolicy: { retentionMs: 60_000, now: () => testOccurredAt },
			baseline: "map",
		},
	});
	return {
		hydrator,
		writer,
		map,
		loads: () => loads,
		entityLoads: () => entityLoads,
		envelopes,
		holdEntityLoads: () => {
			const held = Promise.withResolvers<void>();
			gate = held.promise;
			return () => {
				gate = null;
				held.resolve();
			};
		},
		entityIdentity: ({ index }: { index: number }): MeteringIdentity => ({
			...identity,
			entityId: entityIdOf({ index }),
		}),
	};
};

const checkCommandFor = ({
	entityIdentity,
}: {
	entityIdentity: MeteringIdentity;
}) =>
	parseCheckCommand({
		input: {
			schemaVersion: 1,
			type: "check",
			org: testOrg,
			requestId: `req_${entityIdentity.entityId}`,
			identity: entityIdentity,
			featureId,
			internalFeatureId: `feat_${featureId}`,
			requiredBalance: 1,
			properties: null,
			occurredAt: testOccurredAt,
		},
	});

/** One worker check as `processor.check` runs it: ensure (may load), then the synchronous read, decision and reply slimming. */
const runCheck = async ({
	hydrator,
	writer,
	entityIdentity,
}: {
	hydrator: SubjectHydrator;
	writer: Pick<PartitionWriter, "readFreshestState">;
	entityIdentity: MeteringIdentity;
}) => {
	const command = checkCommandFor({ entityIdentity });
	const ensureStart = performance.now();
	await hydrator.ensure({ identity: entityIdentity });
	const ensureMs = performance.now() - ensureStart;
	const computeStart = performance.now();
	const state = writer.readFreshestState({ identity: entityIdentity });
	if (!state) throw new Error("state missing after ensure");
	const catalog = hydrator.readCatalog({ state });
	const fullSubject = hydrator.readSubject({ state, identity: entityIdentity });
	const result = computeCheck({ fullSubject, command });
	const reply = {
		result,
		...slimSubjectForFeatures({ state, catalog, featureIds: [featureId] }),
	};
	const computeMs = performance.now() - computeStart;
	return { reply, ensureMs, computeMs };
};

const median = (values: number[]) => {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

const warmPass = async ({
	customer,
	entities,
}: {
	customer: ReturnType<typeof createCustomer>;
	entities: number;
}) => {
	for (let index = 0; index < entities; index++) {
		await runCheck({
			hydrator: customer.hydrator,
			writer: customer.writer,
			entityIdentity: customer.entityIdentity({ index }),
		});
	}
};

const measurePass = async ({
	customer,
	indexes,
}: {
	customer: ReturnType<typeof createCustomer>;
	indexes: number[];
}) => {
	const compute: number[] = [];
	const ensure: number[] = [];
	for (const index of indexes) {
		const timed = await runCheck({
			hydrator: customer.hydrator,
			writer: customer.writer,
			entityIdentity: customer.entityIdentity({ index }),
		});
		expect(timed.reply.result.allowed).toBe(true);
		compute.push(timed.computeMs);
		ensure.push(timed.ensureMs);
	}
	return { computeMs: median(compute), ensureMs: median(ensure) };
};

const sample = ({ count }: { count: number }) =>
	Array.from({ length: count }, (_, index) => index);

const roomy = 1024 * 1024 * 1024;

describe("entity hydration scaling", () => {
	test("a warm check's compute does not grow with the customer's entity count", async () => {
		const small = createCustomer({ entities: 250, maxBytes: roomy });
		const large = createCustomer({ entities: 6_000, maxBytes: roomy });
		await warmPass({ customer: small, entities: 250 });
		await warmPass({ customer: large, entities: 6_000 });
		await measurePass({ customer: small, indexes: sample({ count: 200 }) });
		await measurePass({ customer: large, indexes: sample({ count: 200 }) });

		const smallWarm = await measurePass({
			customer: small,
			indexes: sample({ count: 200 }),
		});
		const largeWarm = await measurePass({
			customer: large,
			indexes: sample({ count: 200 }),
		});
		const perEntityBytes = Math.round(large.map.sizeBytes() / 6_001);
		console.log(
			`warm compute per check: 250 entities ${smallWarm.computeMs.toFixed(3)} ms, 6,000 entities ${largeWarm.computeMs.toFixed(3)} ms; resident bytes per entity state ${perEntityBytes}; default map holds ~${Math.floor(SUBJECT_MAP_MAX_BYTES / perEntityBytes)} such entities`,
		);

		expect(largeWarm.computeMs).toBeLessThan(2);
		expect(largeWarm.computeMs).toBeLessThan(smallWarm.computeMs * 3);
		expect(largeWarm.ensureMs).toBeLessThan(1);
	});

	test("the first check of every entity pays its own Postgres subject load, so cold cost scales with distinct entities touched", async () => {
		for (const entities of [250, 6_000]) {
			const customer = createCustomer({ entities, maxBytes: roomy });
			await warmPass({ customer, entities });
			expect(customer.loads()).toBe(entities + 1);
		}
	});

	test("concurrent first touches of a customer's entities coalesce: 6,000 cold entities cost at most ceil(6000/200)+1 subject loads", async () => {
		const customer = createCustomer({ entities: 6_000, maxBytes: roomy });
		const replies = await Promise.all(
			sample({ count: 6_000 }).map((index) =>
				runCheck({
					hydrator: customer.hydrator,
					writer: customer.writer,
					entityIdentity: customer.entityIdentity({ index }),
				}),
			),
		);
		for (const { reply } of replies) expect(reply.result.allowed).toBe(true);
		expect(customer.loads()).toBeLessThanOrEqual(Math.ceil(6_000 / 200) + 1);
		expect(customer.entityLoads()).toBeGreaterThanOrEqual(2);
	});

	test("an evict landing while a batch is in flight makes those entities re-read, and the fresh rows win", async () => {
		const customer = createCustomer({ entities: 20, maxBytes: roomy });
		await warmPass({ customer, entities: 1 });
		const release = customer.holdEntityLoads();
		const pending = [5, 6, 7].map((index) =>
			runCheck({
				hydrator: customer.hydrator,
				writer: customer.writer,
				entityIdentity: customer.entityIdentity({ index }),
			}),
		);
		await Promise.resolve();
		for (const index of [5, 6, 7]) {
			const stale = customer.envelopes.get(entityIdOf({ index }));
			if (!stale) throw new Error("fixture entity missing");
			customer.envelopes.set(entityIdOf({ index }), {
				...stale,
				customer_entitlements: stale.customer_entitlements.map((row) => ({
					...row,
					balance: 0,
				})),
			});
		}
		customer.hydrator.overtakeInFlightLoads({
			customerKey: meteringIdentityToPartitionKey({ identity }),
		});
		release();
		const replies = await Promise.all(pending);
		for (const { reply } of replies) expect(reply.result.allowed).toBe(false);
	});

	test("under the default budget of a 4 GiB worker holding five partitions that each hold a full equal share, a 6,000-entity customer stays resident across a second pass", async () => {
		const budget = createSubjectMapBudget({
			totalBytes: subjectMapBudgetBytesOf({
				containerMemoryBytes: 4 * 1024 * 1024 * 1024,
				memoryFraction: BALANCE_WORKER_SUBJECT_MAP_MEMORY_FRACTION,
			}),
		});
		const partitions = 5;
		const equalShare = Math.floor(budget.totalBytes / partitions);
		for (let peer = 1; peer < partitions; peer++)
			budget.join({ sizeBytes: () => equalShare });
		let map: { sizeBytes(): number } | null = null;
		const share = budget.join({ sizeBytes: () => map?.sizeBytes() ?? 0 });
		const customer = createCustomer({
			entities: 6_000,
			maxBytes: () => share.maxBytes(),
		});
		map = customer.map;
		await warmPass({ customer, entities: 6_000 });
		const loadsAfterFirstPass = customer.loads();
		await warmPass({ customer, entities: 6_000 });
		expect(customer.loads()).toBe(loadsAfterFirstPass);
		expect(customer.map.sizeBytes()).toBeLessThan(share.maxBytes());
	});

	test("a map bound below the customer's footprint re-loads entities on every pass; a small customer stays resident", async () => {
		const sized = createCustomer({ entities: 6_000, maxBytes: roomy });
		await warmPass({ customer: sized, entities: 6_000 });
		const footprint = sized.map.sizeBytes();

		const churning = createCustomer({
			entities: 6_000,
			maxBytes: Math.floor(footprint / 2),
		});
		await warmPass({ customer: churning, entities: 6_000 });
		const loadsAfterFirstPass = churning.loads();
		await warmPass({ customer: churning, entities: 6_000 });
		const reloads = churning.loads() - loadsAfterFirstPass;

		const small = createCustomer({
			entities: 250,
			maxBytes: Math.floor(footprint / 2),
		});
		await warmPass({ customer: small, entities: 250 });
		const smallLoads = small.loads();
		await warmPass({ customer: small, entities: 250 });

		console.log(
			`6,000-entity footprint ${footprint} bytes; with half that as the bound the second pass re-loaded ${reloads} of 6,000 entities; 250 entities re-loaded ${small.loads() - smallLoads}`,
		);
		expect(reloads).toBeGreaterThan(3_000);
		expect(small.loads()).toBe(smallLoads);
	});
});
