import {
	AllowanceType,
	AppEnv,
	CusProductStatus,
	EntInterval,
	FeatureType,
	PooledBalanceResetMode,
} from "@autumn/shared";
import {
	type Catalog,
	type CatalogRow,
	type CommandOrg,
	catalogRowsToCatalog,
	createSubjectState,
	parseCheckCommand,
	parseInitializeRequest,
	parseTrackCommand,
	type SubjectState,
	type SubjectStateMutation,
	subjectStateToFullSubject,
	type TrackResult,
	type WorkerCustomerEntitlement,
	type WorkerCustomerLicense,
	type WorkerCustomerProduct,
	type WorkerFullSubject,
	type WorkerPooledBalance,
} from "../../src/balanceEngine.js";

export const identity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
	entityId: null,
} as const;

export const occurredAt = 1_700_000_000_000;

export const org: CommandOrg = {
	config: {
		reverse_deduction_order: false,
		block_overdue_entitlements: false,
		include_past_due: true,
	},
};

const internalFeatureIdOf = (featureId: string) => `feat_${featureId}`;
const entitlementIdOf = (customerEntitlementId: string) =>
	`ent_${customerEntitlementId}`;
export const testProductInternalId = "prod_internal_pro";

export const createCustomerProduct = ({
	id = "cp_1",
	internalEntityId = null,
	status = CusProductStatus.Active,
	customerLicenseLinkId = null,
	subscriptionIds,
	canceledAt,
}: {
	id?: string;
	internalEntityId?: string | null;
	status?: CusProductStatus;
	customerLicenseLinkId?: string | null;
	subscriptionIds?: string[] | null;
	canceledAt?: number | null;
} = {}): WorkerCustomerProduct => ({
	id,
	internal_customer_id: "cus_internal_1",
	internal_product_id: testProductInternalId,
	internal_entity_id: internalEntityId,
	status,
	options: [],
	quantity: 1,
	created_at: occurredAt,
	starts_at: occurredAt,
	access_starts_at: null,
	ended_at: null,
	customer_license_link_id: customerLicenseLinkId,
	...(subscriptionIds !== undefined && { subscription_ids: subscriptionIds }),
	...(canceledAt !== undefined && { canceled_at: canceledAt }),
});

/** A license pool on `parentCustomerProductId`, reachable from seats by `linkId`. */
export const createCustomerLicense = ({
	id = "cl_1",
	linkId = "link_1",
	parentCustomerProductId = "cp_1",
}: {
	id?: string;
	linkId?: string;
	parentCustomerProductId?: string;
} = {}): WorkerCustomerLicense => ({
	id,
	link_id: linkId,
	internal_customer_id: "cus_internal_1",
	parent_customer_product_id: parentCustomerProductId,
	license_internal_product_id: testProductInternalId,
	plan_license_id: null,
	granted: 10,
	remaining: 7,
	paid_quantity: 5,
	created_at: occurredAt,
	updated_at: occurredAt,
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

export const createPooledBalance = ({
	id = "pool_1",
	customerEntitlementId = "pool_ce",
	granted = 100,
	unlimited = false,
	resetMode = PooledBalanceResetMode.Lazy,
	customerLicenseLinkId = null,
}: {
	id?: string;
	customerEntitlementId?: string;
	granted?: number;
	unlimited?: boolean;
	resetMode?: PooledBalanceResetMode;
	customerLicenseLinkId?: string | null;
} = {}): WorkerPooledBalance => ({
	id,
	org_id: identity.orgId,
	env: identity.env,
	internal_customer_id: "cus_internal_1",
	internal_feature_id: "feat_internal_messages",
	unlimited,
	granted,
	interval: EntInterval.Month,
	interval_count: 1,
	reset_cycle_anchor: null,
	reset_mode: resetMode,
	stripe_subscription_id: null,
	customer_license_link_id: customerLicenseLinkId,
	rollover_signature: "",
	customer_entitlement_id: customerEntitlementId,
	last_applied_reset_at: null,
	expires_at: null,
	created_at: occurredAt,
	updated_at: occurredAt,
});

export const entity = {
	id: "ent_42",
	internal_id: "ent_internal_42",
	internal_customer_id: "cus_internal_1",
	feature_id: "seats",
} as const;

/** What an entity initialize carries: the entity and the rows it owns, under the entity's identity. */
export const createEntityState = ({
	customerEntitlements = [
		{
			...createCustomerEntitlement({ id: "seats_ent_42", featureId: "seats" }),
			internal_entity_id: entity.internal_id,
		},
	],
}: {
	customerEntitlements?: WorkerCustomerEntitlement[];
} = {}): SubjectState =>
	createSubjectState({
		identity: { ...identity, entityId: entity.id },
		customerEntitlements,
		entity,
	});

export const createState = ({
	balance = 10,
	customerEntitlements,
}: {
	balance?: number;
	customerEntitlements?: WorkerCustomerEntitlement[];
} = {}) =>
	createSubjectState({
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
	state: SubjectState;
}): CatalogRow[] => [
	...state.customerEntitlements.map(entitlementRowOf),
	...[
		...new Set(
			state.customerEntitlements.map((row) => row.internal_feature_id),
		),
	].map(featureRowOf),
	...state.customerProducts.map((row) => productRowOf(row.internal_product_id)),
];

export const createCatalogFor = ({ state }: { state: SubjectState }): Catalog =>
	catalogRowsToCatalog({ rows: createCatalogRowsFor({ state }) });

/** The view a command computes against: state joined with the catalog it references. */
export const createSubjectFor = ({
	state,
	entityId = null,
}: {
	state: SubjectState;
	entityId?: string | null;
}): WorkerFullSubject =>
	subjectStateToFullSubject({
		state,
		catalog: createCatalogFor({ state }),
		entityId,
	});

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
			org,
			commandId,
			requestId,
			identity: { ...identity, entityId },
			featureId,
			internalFeatureId: internalFeatureIdOf(featureId),
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
			org,
			requestId: "req_check_1",
			identity: { ...identity, entityId },
			featureId,
			internalFeatureId: internalFeatureIdOf(featureId),
			requiredBalance,
			properties,
			occurredAt,
		},
	});

export const createInitializeRequest = ({
	commandId = "init_1",
	requestId = "req_init_1",
	state = createState(),
}: {
	commandId?: string;
	requestId?: string;
	state?: ReturnType<typeof createState>;
} = {}) =>
	parseInitializeRequest({
		input: {
			command: {
				schemaVersion: 1,
				type: "initialize",
				requestId,
				commandId,
				identity: state.identity,
				occurredAt,
			},
			state,
			catalogRows: createCatalogRowsFor({ state }),
		},
	});

export const trackResultOf = ({
	mutation,
}: {
	mutation: SubjectStateMutation;
}): TrackResult => {
	if (mutation.result.type !== "track") {
		throw new Error(
			`Expected a track result, received ${mutation.result.type}`,
		);
	}
	return mutation.result;
};
