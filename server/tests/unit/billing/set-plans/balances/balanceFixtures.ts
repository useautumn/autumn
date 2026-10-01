import {
	BillingInterval,
	CusProductStatus,
	EntInterval,
	type Entity,
	FeatureUsageType,
	type FullCusProduct,
	type FullCustomer,
	type FullCustomerEntitlement,
	ms,
	type Price,
	type SetPlansPreviewBalanceChange,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { customers } from "@tests/utils/fixtures/db/customers";
import { features } from "@tests/utils/fixtures/db/features";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildSavedPhaseCustomers } from "@/internal/billing/v2/actions/setPlans/preview/balances/buildSavedPhaseCustomers";
import { buildSetPlansPhaseCustomers } from "@/internal/billing/v2/actions/setPlans/preview/buildSetPlansPhaseCustomers";
import { setPlansPhaseBalanceChanges } from "@/internal/billing/v2/actions/setPlans/preview/setPlansPhaseBalanceChanges";
import type { SchedulePhasePlan } from "@/internal/billing/v2/actions/setPlans/types/schedulePhasePlan";
import {
	makeAutumnBillingPlan,
	makeUpdate,
} from "../../billing-change-response/helpers/makeAutumnBillingPlan";

export const NOW = 1_800_000_000_000;
export const PHASE_TWO = NOW + ms.days(30);
export const PHASE_THREE = NOW + ms.days(60);

const CONSUMABLE = { usage_type: FeatureUsageType.Single };
const ALLOCATED = { usage_type: FeatureUsageType.Continuous };

export type BalanceFeatureId = "words" | "seats" | "credits" | "api_calls";

const FEATURE_CONFIGS: Record<BalanceFeatureId, Record<string, unknown>> = {
	words: CONSUMABLE,
	seats: ALLOCATED,
	credits: CONSUMABLE,
	api_calls: CONSUMABLE,
};

export const balanceCtx = {
	...contexts.create({
		features: Object.entries(FEATURE_CONFIGS).map(([id, config]) =>
			features.create({ id, name: id, config }),
		),
	}),
	expand: [],
} as unknown as AutumnContext;

/** A balance a plan row holds, with the price that gives it its kind. */
export type RowBalance = {
	customerEntitlement: FullCustomerEntitlement;
	price?: Price;
};

const customerEntitlementFor = ({
	customerProductId,
	featureId,
	allowance,
	usage,
	interval,
	usageAllowed,
}: {
	customerProductId: string;
	featureId: BalanceFeatureId;
	allowance: number;
	usage: number;
	interval: EntInterval | null;
	usageAllowed: boolean;
}) =>
	customerEntitlements.create({
		entitlementId: `ent_${featureId}_${customerProductId}`,
		featureId,
		featureName: featureId,
		featureConfig: FEATURE_CONFIGS[featureId],
		interval,
		allowance,
		balance: allowance - usage,
		customerProductId,
		usageAllowed,
	});

/** A monthly allowance with no overage. */
export const included =
	({
		featureId,
		allowance,
		usage = 0,
	}: {
		featureId: BalanceFeatureId;
		allowance: number;
		usage?: number;
	}) =>
	(customerProductId: string): RowBalance => ({
		customerEntitlement: customerEntitlementFor({
			customerProductId,
			featureId,
			allowance,
			usage,
			interval: featureId === "seats" ? null : EntInterval.Month,
			usageAllowed: false,
		}),
	});

/** Billed per unit in arrear: nothing granted, overage allowed. */
export const payPerUse =
	({ featureId, usage = 0 }: { featureId: BalanceFeatureId; usage?: number }) =>
	(customerProductId: string): RowBalance => ({
		customerEntitlement: customerEntitlementFor({
			customerProductId,
			featureId,
			allowance: 0,
			usage,
			interval: EntInterval.Month,
			usageAllowed: true,
		}),
		price: prices.createConsumable({
			id: `price_${featureId}_${customerProductId}`,
			featureId,
			entitlementId: `ent_${featureId}_${customerProductId}`,
		}),
	});

/** Credits bought once with the plan; billing keeps what is left when the plan ends. */
export const oneOffPrepaid =
	({
		featureId,
		quantity,
		usage = 0,
	}: {
		featureId: BalanceFeatureId;
		quantity: number;
		usage?: number;
	}) =>
	(customerProductId: string): RowBalance => {
		const prepaid = prices.createPrepaid({
			id: `price_${featureId}_${customerProductId}`,
			featureId,
			entitlementId: `ent_${featureId}_${customerProductId}`,
		});
		return {
			customerEntitlement: customerEntitlementFor({
				customerProductId,
				featureId,
				allowance: quantity,
				usage,
				interval: null,
				usageAllowed: false,
			}),
			price: {
				...prepaid,
				config: { ...prepaid.config, interval: BillingInterval.OneOff },
			} as Price,
		};
	};

export const planRow = ({
	planId,
	rowId = `cp_${planId}`,
	balances,
	status = CusProductStatus.Active,
	startsAt = NOW - ms.days(10),
	endedAt,
	isAddOn = false,
	internalEntityId,
}: {
	planId: string;
	rowId?: string;
	balances: ((customerProductId: string) => RowBalance)[];
	status?: CusProductStatus;
	startsAt?: number;
	endedAt?: number;
	isAddOn?: boolean;
	internalEntityId?: string;
}): FullCusProduct => {
	const rowBalances = balances.map((balance) => balance(rowId));
	const balancePrices = rowBalances.flatMap(({ price }) =>
		price ? [price] : [],
	);
	const product = products.createFull({
		id: planId,
		isAddOn,
		prices: [prices.createFixed({ id: `price_${planId}` }), ...balancePrices],
	});
	return customerProducts.create({
		id: rowId,
		productId: planId,
		product,
		status,
		startsAt,
		endedAt,
		internalEntityId,
		customerEntitlements: rowBalances.map(
			({ customerEntitlement }) => customerEntitlement,
		),
		customerPrices: product.prices.map((price) =>
			prices.createCustomer({ price, customerProductId: rowId }),
		),
	});
};

export const scheduledRow = (params: Parameters<typeof planRow>[0]) =>
	planRow({ status: CusProductStatus.Scheduled, ...params });

export type BalanceTimeline = {
	current: FullCusProduct[];
	inserts?: FullCusProduct[];
	endings?: { customerProduct: FullCusProduct; endedAt: number }[];
	expirations?: FullCusProduct[];
	deletes?: FullCusProduct[];
	phases: SchedulePhasePlan[];
	customerEntities?: Entity[];
};

/** A request projected onto saved rows, diffed per phase against the saved schedule. */
export const previewBalanceChanges = ({
	current,
	inserts = [],
	endings = [],
	expirations = [],
	deletes = [],
	phases,
	customerEntities = [],
}: BalanceTimeline): Promise<SetPlansPreviewBalanceChange[][]> => {
	const fullCustomer: FullCustomer = {
		...customers.create({ customerProducts: current }),
		entities: customerEntities,
	};
	const autumnBillingPlan = makeAutumnBillingPlan({
		inserts,
		deletes,
		updates: [
			...endings.map(({ customerProduct, endedAt }) =>
				makeUpdate({ customerProduct, updates: { ended_at: endedAt } }),
			),
			...expirations.map((customerProduct) =>
				makeUpdate({
					customerProduct,
					updates: { status: CusProductStatus.Expired, ended_at: NOW },
				}),
			),
		],
	});

	return setPlansPhaseBalanceChanges({
		ctx: balanceCtx,
		originalFullCustomer: fullCustomer,
		phaseCustomers: buildSetPlansPhaseCustomers({
			ctx: balanceCtx,
			fullCustomer,
			autumnBillingPlan,
			phases,
		}),
		savedPhaseCustomers: buildSavedPhaseCustomers({
			ctx: balanceCtx,
			fullCustomer,
			autumnBillingPlan,
			phases,
		}),
	});
};

export const describeBalanceChange = ({
	entity_id,
	feature_id,
	behavior,
	origin,
	balance,
	previous_attributes,
}: SetPlansPreviewBalanceChange) =>
	`${entity_id ? `${entity_id}/` : ""}${feature_id} ${behavior} (${origin}): ${previous_attributes.granted ?? balance.granted} -> ${balance.granted} granted, ${balance.remaining} left`;

export const describeBalancePhases = (
	phaseChanges: SetPlansPreviewBalanceChange[][],
) => phaseChanges.map((changes) => changes.map(describeBalanceChange));
