import {
	type Catalog,
	type CatalogRow,
	type CustomerState,
	type CustomerStateMutation,
	catalogRowsToCatalog,
	computeInitialize,
	computeTrack,
	createCustomerState,
	type MeteringIdentity,
	parseInitializeCommand,
	parseTrackCommand,
} from "@autumn/balance-engine";
import {
	AllowanceType,
	AppEnv,
	CusProductStatus,
	EntInterval,
	FeatureType,
} from "@autumn/shared";

export const testIdentity: MeteringIdentity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
	entityId: null,
};

const occurredAt = 1_700_000_000_000;
const deduplicationExpiresAt = 1_700_086_400_000;
const internalFeatureId = "feat_messages";
const entitlementId = "ent_messages_monthly";
const internalProductId = "prod_internal_pro";

export const createState = ({
	identity = testIdentity,
	balance = 10,
}: {
	identity?: MeteringIdentity;
	balance?: number;
} = {}): CustomerState =>
	createCustomerState({
		identity,
		customerProducts: [
			{
				id: "cp_1",
				internal_customer_id: "cus_internal_1",
				internal_product_id: internalProductId,
				internal_entity_id: null,
				status: CusProductStatus.Active,
				options: [],
				quantity: 1,
				created_at: occurredAt,
			},
		],
		customerEntitlements: [
			{
				id: "messages_monthly",
				customer_product_id: "cp_1",
				entitlement_id: entitlementId,
				internal_customer_id: "cus_internal_1",
				internal_entity_id: null,
				internal_feature_id: internalFeatureId,
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
			},
		],
	});

/** The catalog rows every fixture state references. */
export const testCatalogRows: CatalogRow[] = [
	{
		table: "entitlements",
		row: {
			id: entitlementId,
			created_at: occurredAt,
			internal_feature_id: internalFeatureId,
			internal_product_id: internalProductId,
			is_custom: false,
			allowance_type: AllowanceType.Fixed,
			allowance: 1000,
			interval: EntInterval.Month,
			interval_count: 1,
			org_id: testIdentity.orgId,
			usage_limit: null,
		},
	},
	{
		table: "features",
		row: {
			internal_id: internalFeatureId,
			org_id: testIdentity.orgId,
			created_at: occurredAt,
			env: AppEnv.Sandbox,
			id: "messages",
			name: "Messages",
			type: FeatureType.Metered,
			config: {},
			archived: false,
			event_names: [],
		},
	},
	{
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
			created_at: occurredAt,
			base_variant_id: null,
			archived: false,
			config: { ignore_past_due: false },
			metadata: {},
		},
	},
];

export const testCatalog: Catalog = catalogRowsToCatalog({
	rows: testCatalogRows,
});

export const createTrackMutation = ({
	state = createState(),
	commandId = "cmd_1",
	value = 5,
}: {
	state?: CustomerState;
	commandId?: string;
	value?: number;
} = {}): CustomerStateMutation => {
	const decision = computeTrack({
		state,
		catalog: testCatalog,
		deduplicationExpiresAt,
		command: parseTrackCommand({
			input: {
				schemaVersion: 1,
				type: "track",
				commandId,
				requestId: `req_${commandId}`,
				identity: state.identity,
				featureId: "messages",
				value,
				overageBehavior: "reject",
				properties: null,
				occurredAt,
			},
		}),
	});
	if (decision.kind !== "new") {
		throw new Error(`Expected a new mutation, received ${decision.kind}`);
	}
	return decision.mutation;
};

export const createInitializeMutation = ({
	state = createState(),
	commandId = "init_1",
}: {
	state?: CustomerState;
	commandId?: string;
} = {}): CustomerStateMutation =>
	computeInitialize({
		command: parseInitializeCommand({
			input: {
				schemaVersion: 1,
				type: "initialize",
				requestId: `req_${commandId}`,
				commandId,
				identity: state.identity,
				state,
				catalogRows: testCatalogRows,
				occurredAt,
			},
		}),
		deduplicationExpiresAt,
	});
