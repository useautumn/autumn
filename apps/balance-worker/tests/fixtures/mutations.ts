import {
	applyMutation,
	type Catalog,
	type CatalogRow,
	type CustomerState,
	type CustomerStateMutation,
	catalogRowsToCatalog,
	computeInitialize,
	computeTrack,
	createCustomerState,
	type MeteringIdentity,
	meteringPartitionKeyOf,
	type OverageBehavior,
	parseInitializeCommand,
	parseTrackCommand,
	type TrackCommand,
	type WorkerCustomerEntitlement,
	type WorkerCustomerProduct,
} from "@autumn/balance-engine";
import {
	AllowanceType,
	AppEnv,
	CusProductStatus,
	EntInterval,
	FeatureType,
} from "@autumn/shared";
import { createPartitionCheckpoint } from "../../src/checkpoint/partitionCheckpoint.js";
import type { DurableMutationApplyResult } from "../../src/state/types/durableMutation.js";
import type { StateStore } from "../../src/state/types/stateStore.js";

export const testIdentity: MeteringIdentity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
	entityId: null,
};

export const testOccurredAt = 1_700_000_000_000;
export const testDeduplicationExpiresAt = 1_700_086_400_000;

/** Deterministic catalog ids so a state's rows and the catalog rows they reference agree by construction. */
const internalFeatureIdOf = (featureId: string) => `feat_${featureId}`;
const entitlementIdOf = (customerEntitlementId: string) =>
	`ent_${customerEntitlementId}`;
export const testProductInternalId = "prod_internal_pro";
export const testCustomerProductId = "cp_1";

export const createCustomerProduct = ({
	id = testCustomerProductId,
	internalProductId = testProductInternalId,
}: {
	id?: string;
	internalProductId?: string;
} = {}): WorkerCustomerProduct => ({
	id,
	internal_customer_id: "cus_internal_1",
	internal_product_id: internalProductId,
	internal_entity_id: null,
	status: CusProductStatus.Active,
	options: [],
	quantity: 1,
	created_at: testOccurredAt,
});

export const createCustomerEntitlement = ({
	id = "messages_monthly",
	featureId = "messages",
	balance = 10,
	externalId = null,
}: {
	id?: string;
	featureId?: string;
	balance?: number;
	externalId?: string | null;
} = {}): WorkerCustomerEntitlement => ({
	id,
	customer_product_id: testCustomerProductId,
	entitlement_id: entitlementIdOf(id),
	internal_customer_id: "cus_internal_1",
	internal_entity_id: null,
	internal_feature_id: internalFeatureIdOf(featureId),
	balance,
	adjustment: 0,
	additional_balance: 0,
	unlimited: false,
	usage_allowed: false,
	next_reset_at: null,
	reset_cycle_anchor: null,
	expires_at: null,
	external_id: externalId,
	created_at: testOccurredAt,
});

export const createState = ({
	identity = testIdentity,
	balance = 10,
	customerEntitlements,
}: {
	identity?: MeteringIdentity;
	balance?: number;
	customerEntitlements?: WorkerCustomerEntitlement[];
} = {}): CustomerState =>
	createCustomerState({
		identity,
		customerProducts: [createCustomerProduct()],
		customerEntitlements: customerEntitlements ?? [
			createCustomerEntitlement({ balance }),
		],
	});

const entitlementRowOf = ({
	customerEntitlement,
}: {
	customerEntitlement: WorkerCustomerEntitlement;
}): CatalogRow => ({
	table: "entitlements",
	row: {
		id: customerEntitlement.entitlement_id,
		created_at: testOccurredAt,
		internal_feature_id: customerEntitlement.internal_feature_id,
		internal_product_id: testProductInternalId,
		is_custom: false,
		allowance_type: AllowanceType.Fixed,
		allowance: 1000,
		interval: EntInterval.Month,
		interval_count: 1,
		org_id: testIdentity.orgId,
		usage_limit: null,
	},
});

const featureRowOf = ({
	internalFeatureId,
}: {
	internalFeatureId: string;
}): CatalogRow => ({
	table: "features",
	row: {
		internal_id: internalFeatureId,
		org_id: testIdentity.orgId,
		created_at: testOccurredAt,
		env: AppEnv.Sandbox,
		id: internalFeatureId.replace(/^feat_/, ""),
		name: internalFeatureId,
		type: FeatureType.Metered,
		config: {},
		archived: false,
		event_names: [],
	},
});

const productRowOf = ({
	internalProductId,
}: {
	internalProductId: string;
}): CatalogRow => ({
	table: "products",
	row: {
		id: "pro",
		name: "Pro",
		description: null,
		is_add_on: false,
		is_default: false,
		version: 1,
		version_slug: "v1",
		active: true,
		deleted_at: null,
		previous_version_slug: null,
		group: "",
		env: AppEnv.Sandbox,
		internal_id: internalProductId,
		org_id: testIdentity.orgId,
		created_at: testOccurredAt,
		base_variant_id: null,
		archived: false,
		config: { ignore_past_due: false },
		metadata: {},
	},
});

/** Every catalog row `state` references, so a command computed against them never misses. */
export const createCatalogRowsFor = ({
	state,
}: {
	state: CustomerState;
}): CatalogRow[] => [
	...state.customerEntitlements.map((customerEntitlement) =>
		entitlementRowOf({ customerEntitlement }),
	),
	...[
		...new Set(
			state.customerEntitlements.map(
				(customerEntitlement) => customerEntitlement.internal_feature_id,
			),
		),
	].map((internalFeatureId) => featureRowOf({ internalFeatureId })),
	...state.customerProducts.map((customerProduct) =>
		productRowOf({ internalProductId: customerProduct.internal_product_id }),
	),
];

export const createCatalogFor = ({
	state,
}: {
	state: CustomerState;
}): Catalog => catalogRowsToCatalog({ rows: createCatalogRowsFor({ state }) });

export const createTrackCommand = ({
	identity = testIdentity,
	commandId = "cmd_1",
	requestId,
	featureId = "messages",
	value = 5,
	overageBehavior = "reject",
	occurredAt = testOccurredAt,
}: {
	identity?: MeteringIdentity;
	commandId?: string;
	requestId?: string;
	featureId?: string;
	value?: number;
	overageBehavior?: OverageBehavior;
	occurredAt?: number;
} = {}): TrackCommand =>
	parseTrackCommand({
		input: {
			schemaVersion: 1,
			type: "track",
			commandId,
			requestId: requestId ?? `req_${commandId}`,
			identity,
			featureId,
			value,
			overageBehavior,
			properties: null,
			occurredAt,
		},
	});

export const createInitializeCommand = ({
	state = createState(),
	commandId = "init_1",
	requestId = "req_init_1",
	occurredAt = testOccurredAt,
}: {
	state?: CustomerState;
	commandId?: string;
	requestId?: string;
	occurredAt?: number;
} = {}) =>
	parseInitializeCommand({
		input: {
			schemaVersion: 1,
			type: "initialize",
			requestId,
			commandId,
			identity: state.identity,
			state,
			catalogRows: createCatalogRowsFor({ state }),
			occurredAt,
		},
	});

export const createInitializeMutation = ({
	state = createState(),
	commandId = "init_1",
	requestId = "req_init_1",
	occurredAt = testOccurredAt,
	deduplicationExpiresAt = testDeduplicationExpiresAt,
}: {
	state?: CustomerState;
	commandId?: string;
	requestId?: string;
	occurredAt?: number;
	deduplicationExpiresAt?: number;
} = {}): CustomerStateMutation =>
	computeInitialize({
		command: createInitializeCommand({
			state,
			commandId,
			requestId,
			occurredAt,
		}),
		deduplicationExpiresAt,
	});

export const createTrackMutation = ({
	state = createState(),
	command,
	deduplicationExpiresAt = testDeduplicationExpiresAt,
	...commandOverrides
}: {
	state?: CustomerState;
	command?: TrackCommand;
	deduplicationExpiresAt?: number;
	commandId?: string;
	requestId?: string;
	featureId?: string;
	value?: number;
	overageBehavior?: OverageBehavior;
	occurredAt?: number;
} = {}): CustomerStateMutation => {
	const decision = computeTrack({
		state,
		catalog: createCatalogFor({ state }),
		command:
			command ??
			createTrackCommand({ identity: state.identity, ...commandOverrides }),
		deduplicationExpiresAt,
	});
	if (decision.kind !== "new") {
		throw new Error(`Expected a new mutation, received ${decision.kind}`);
	}
	return decision.mutation;
};

export const requireNewMutation = ({
	decision,
}: {
	decision: { kind: string; mutation?: CustomerStateMutation };
}): CustomerStateMutation => {
	if (decision.kind !== "new" || !decision.mutation) {
		throw new Error(`Expected a new mutation, received ${decision.kind}`);
	}
	return decision.mutation;
};

export const applyDurableMutation = ({
	store,
	topic,
	partition,
	offset,
	mutation,
}: {
	store: Pick<StateStore, "applyDurableMutations">;
	topic: string;
	partition: number;
	offset: bigint;
	mutation: CustomerStateMutation;
}): DurableMutationApplyResult => {
	const [result] = store.applyDurableMutations({
		records: [{ position: { topic, partition, offset }, mutation }],
	});
	if (!result) throw new Error("Expected a durable mutation result");
	return result;
};

/** Seeds a customer the way the log does: one initialize mutation at `offset`. */
export const seedCustomerState = ({
	store,
	topic,
	partition,
	offset = 0n,
	state = createState(),
	commandId = "init_1",
	deduplicationExpiresAt,
}: {
	store: Pick<StateStore, "applyDurableMutations">;
	topic: string;
	partition: number;
	offset?: bigint;
	state?: CustomerState;
	commandId?: string;
	deduplicationExpiresAt?: number;
}): CustomerState => {
	const mutation = createInitializeMutation({
		state,
		commandId,
		deduplicationExpiresAt,
	});
	applyDurableMutation({ store, topic, partition, offset, mutation });
	return applyMutation({ state: null, mutation });
};

/** Seeds state without consuming a log offset, the way a checkpoint restore does. */
export const restoreCustomerStates = ({
	store,
	topic,
	partition,
	states,
	nextOffset,
}: {
	store: Pick<StateStore, "restorePartitionCheckpoint" | "readNextOffset">;
	topic: string;
	partition: number;
	states: CustomerState[];
	nextOffset?: bigint;
}): void => {
	const existingNextOffset = store.readNextOffset({ topic, partition });
	store.restorePartitionCheckpoint({
		checkpoint: createPartitionCheckpoint({
			engineSchemaVersion: 1,
			createdAt: 0,
			topic,
			partition,
			nextOffset: nextOffset ?? existingNextOffset ?? 0n,
			states: states.map((state) => ({
				partitionKey: meteringPartitionKeyOf({ identity: state.identity }),
				state,
			})),
			receipts: [],
		}),
		mode: existingNextOffset === null ? "restore" : "replace",
		limits: {
			maxSerializedBytes: 16 * 1024 * 1024,
			maxStates: 10_000,
			maxReceipts: 10_000,
		},
		partitionResolver: { partitionForIdentity: () => partition },
	});
};
