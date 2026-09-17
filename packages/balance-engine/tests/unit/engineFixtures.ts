import {
	AllowanceType,
	AppEnv,
	CusProductStatus,
	EntInterval,
	FeatureType,
} from "@autumn/shared";
import {
	type Catalog,
	type CatalogRow,
	type CustomerState,
	type CustomerStateMutation,
	catalogRowsToCatalog,
	createCustomerState,
	parseCheckCommand,
	parseInitializeCommand,
	parseTrackCommand,
	type TrackDecision,
	type TrackResult,
	type WorkerCustomerEntitlement,
	type WorkerCustomerProduct,
} from "../../src/balanceEngine.js";

export const identity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
	entityId: null,
} as const;

export const occurredAt = 1_700_000_000_000;
export const deduplicationExpiresAt = 1_700_086_400_000;

const internalFeatureIdOf = (featureId: string) => `feat_${featureId}`;
const entitlementIdOf = (customerEntitlementId: string) =>
	`ent_${customerEntitlementId}`;
export const testProductInternalId = "prod_internal_pro";

export const createCustomerProduct = (): WorkerCustomerProduct => ({
	id: "cp_1",
	internal_customer_id: "cus_internal_1",
	internal_product_id: testProductInternalId,
	internal_entity_id: null,
	status: CusProductStatus.Active,
	options: [],
	quantity: 1,
	created_at: occurredAt,
});

export const createCustomerEntitlement = ({
	id = "messages_monthly",
	featureId = "messages",
	balance = 10,
}: {
	id?: string;
	featureId?: string;
	balance?: number;
} = {}): WorkerCustomerEntitlement => ({
	id,
	customer_product_id: "cp_1",
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
	external_id: null,
	created_at: occurredAt,
});

export const createState = ({
	balance = 10,
	customerEntitlements,
}: {
	balance?: number;
	customerEntitlements?: WorkerCustomerEntitlement[];
} = {}) =>
	createCustomerState({
		identity,
		customerProducts: [createCustomerProduct()],
		customerEntitlements: customerEntitlements ?? [
			createCustomerEntitlement({ balance }),
		],
	});

const entitlementRowOf = (
	customerEntitlement: WorkerCustomerEntitlement,
): CatalogRow => ({
	table: "entitlements",
	row: {
		id: customerEntitlement.entitlement_id,
		created_at: occurredAt,
		internal_feature_id: customerEntitlement.internal_feature_id,
		internal_product_id: testProductInternalId,
		is_custom: false,
		allowance_type: AllowanceType.Fixed,
		allowance: 1000,
		interval: EntInterval.Month,
		interval_count: 1,
		org_id: identity.orgId,
		usage_limit: null,
	},
});

const featureRowOf = (internalFeatureId: string): CatalogRow => ({
	table: "features",
	row: {
		internal_id: internalFeatureId,
		org_id: identity.orgId,
		created_at: occurredAt,
		env: AppEnv.Sandbox,
		id: internalFeatureId.replace(/^feat_/, ""),
		name: internalFeatureId,
		type: FeatureType.Metered,
		config: {},
		archived: false,
		event_names: [],
	},
});

const productRowOf = (internalProductId: string): CatalogRow => ({
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
		org_id: identity.orgId,
		created_at: occurredAt,
		base_variant_id: null,
		archived: false,
		config: { ignore_past_due: false },
		metadata: {},
	},
});

/** Every catalog row `state` references. */
export const createCatalogRowsFor = ({
	state,
}: {
	state: CustomerState;
}): CatalogRow[] => [
	...state.customerEntitlements.map(entitlementRowOf),
	...[
		...new Set(
			state.customerEntitlements.map((row) => row.internal_feature_id),
		),
	].map(featureRowOf),
	...state.customerProducts.map((row) => productRowOf(row.internal_product_id)),
];

export const createCatalogFor = ({
	state,
}: {
	state: CustomerState;
}): Catalog => catalogRowsToCatalog({ rows: createCatalogRowsFor({ state }) });

export const createTrackCommand = ({
	commandId = "cmd_1",
	requestId = "req_1",
	featureId = "messages",
	value = 5,
	overageBehavior = "reject",
	entityId = null,
	properties = null,
}: {
	commandId?: string;
	requestId?: string;
	featureId?: string;
	value?: number;
	overageBehavior?: "cap" | "reject" | "overflow";
	entityId?: string | null;
	properties?: Record<string, unknown> | null;
} = {}) =>
	parseTrackCommand({
		input: {
			schemaVersion: 1,
			type: "track",
			commandId,
			requestId,
			identity: { ...identity, entityId },
			featureId,
			value,
			overageBehavior,
			properties,
			occurredAt,
		},
	});

export const createCheckCommand = ({
	requiredBalance = 5,
	featureId = "messages",
	entityId = null,
	properties = null,
}: {
	requiredBalance?: number;
	featureId?: string;
	entityId?: string | null;
	properties?: Record<string, unknown> | null;
} = {}) =>
	parseCheckCommand({
		input: {
			schemaVersion: 1,
			type: "check",
			requestId: "req_check_1",
			identity: { ...identity, entityId },
			featureId,
			requiredBalance,
			properties,
			occurredAt,
		},
	});

export const createInitializeCommand = ({
	commandId = "init_1",
	requestId = "req_init_1",
	state = createState(),
}: {
	commandId?: string;
	requestId?: string;
	state?: ReturnType<typeof createState>;
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

export const requireNewMutation = (
	decision: TrackDecision,
): CustomerStateMutation => {
	if (decision.kind !== "new") {
		throw new Error(`Expected a new mutation, received ${decision.kind}`);
	}
	return decision.mutation;
};

export const trackResultOf = ({
	mutation,
}: {
	mutation: CustomerStateMutation;
}): TrackResult => {
	if (mutation.result.type !== "track") {
		throw new Error(
			`Expected a track result, received ${mutation.result.type}`,
		);
	}
	return mutation.result;
};
