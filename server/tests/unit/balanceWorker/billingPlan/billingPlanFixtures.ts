import type { BillingPlanOp } from "@autumn/balance-engine";
import {
	type AutumnBillingPlan,
	CusProductStatus,
	type FullCusProduct,
	type FullCustomerEntitlement,
	type InsertCustomerEntitlement,
	type RolloverConfig,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { customers } from "@tests/utils/fixtures/db/customers.js";
import { entities } from "@tests/utils/fixtures/db/entities.js";
import { prices } from "@tests/utils/fixtures/db/prices.js";
import { rollovers } from "@tests/utils/fixtures/db/rollovers.js";

export const newCustomer = customers.create({});

export const defaultProduct = (): FullCusProduct =>
	customerProducts.create({
		id: "cus_prod_default",
		productId: "free",
		customerEntitlements: [
			customerEntitlements.create({
				id: "cus_ent_messages",
				featureId: "messages",
				featureName: "Messages",
				allowance: 100,
				balance: 100,
				customerProductId: "cus_prod_default",
			}),
		],
	});

/** What `computeCreateCustomerPlan` builds for a customer with one free default. */
export const createCustomerPlan = (): AutumnBillingPlan => ({
	customerId: "cus_test",
	insertCustomer: newCustomer,
	insertCustomerProducts: [defaultProduct()],
});

/** What `finalizeCreateCustomer` builds once Stripe returns the subscription. */
export const linkBackPlan = (): AutumnBillingPlan => ({
	customerId: "cus_test",
	insertCustomerProducts: [],
	updateCustomerProducts: [
		{
			customerProduct: defaultProduct(),
			updates: { subscription_ids: ["sub_1"], scheduled_ids: undefined },
		},
	],
});

export const expiredDefaultUpdate = () => ({
	customerProduct: defaultProduct(),
	updates: { status: CusProductStatus.Expired },
});

/** A plan for `cus_test` with only the facets given. */
export const planOf = (
	facets: Partial<Omit<AutumnBillingPlan, "customerId">>,
): AutumnBillingPlan => ({
	customerId: "cus_test",
	insertCustomerProducts: [],
	...facets,
});

export const opSummary = (ops: BillingPlanOp[]): string[] =>
	ops.map((op) => `${op.op}:${op.table}`);

export const workerEntity = entities.create({
	id: "ent_1",
	featureId: "seats",
});

export const grant = ({
	id,
	customerProductId = null,
	balance = 100,
	internalEntityId = null,
	rollover = null,
}: {
	id: string;
	customerProductId?: string | null;
	balance?: number;
	internalEntityId?: string | null;
	rollover?: RolloverConfig | null;
}): FullCustomerEntitlement => ({
	...customerEntitlements.create({
		id,
		featureId: "messages",
		featureName: "Messages",
		allowance: 100,
		balance,
		rollover,
	}),
	customer_product_id: customerProductId,
	internal_entity_id: internalEntityId,
});

export const customerPrice = ({
	priceId,
	customerProductId,
}: {
	priceId: string;
	customerProductId: string;
}) => ({
	...prices.createCustomer({
		price: prices.buildFixed({ overrides: { id: priceId } }),
		customerProductId,
	}),
	id: `cus_price_${priceId}`,
});

/** A product with one fixed price and one grant, each named after the product. */
export const product = ({
	id,
	status = CusProductStatus.Active,
	onEntity = false,
	grants,
}: {
	id: string;
	status?: CusProductStatus;
	onEntity?: boolean;
	grants?: FullCustomerEntitlement[];
}): FullCusProduct => {
	const internalEntityId = onEntity ? workerEntity.internal_id : null;
	return customerProducts.create({
		id,
		productId: `prod_${id}`,
		status,
		internalEntityId: internalEntityId ?? undefined,
		entityId: onEntity ? (workerEntity.id ?? undefined) : undefined,
		customerPrices: [customerPrice({ priceId: id, customerProductId: id })],
		customerEntitlements: grants ?? [
			grant({
				id: `grant_${id}`,
				customerProductId: id,
				internalEntityId,
			}),
		],
	});
};

export const monthlyRollover = ({
	max,
}: {
	max: number | null;
}): RolloverConfig => ({
	max,
	duration: RolloverExpiryDurationType.Month,
	length: 1,
});

export const rollover = ({
	id,
	grantId,
	balance,
	expiresAt,
}: {
	id: string;
	grantId: string;
	balance: number;
	expiresAt: number;
}) => rollovers.create({ id, cusEntId: grantId, balance, expiresAt });

/** A grant capped at `max`, carrying the rollovers given. */
export const grantWithRollovers = ({
	id,
	customerProductId,
	max,
	carried,
}: {
	id: string;
	customerProductId: string | null;
	max: number | null;
	carried: { id: string; balance: number; expiresAt: number }[];
}): FullCustomerEntitlement => ({
	...grant({ id, customerProductId, rollover: monthlyRollover({ max }) }),
	rollovers: carried.map((carriedRollover) =>
		rollover({ ...carriedRollover, grantId: id }),
	),
});

export const firstGrantOf = (
	customerProduct: FullCusProduct,
): FullCustomerEntitlement => {
	const [customerEntitlement] = customerProduct.customer_entitlements;
	if (!customerEntitlement) throw new Error("fixture has no entitlement");
	return customerEntitlement;
};

/** A loose grant naming only the columns an insert must; Postgres defaults the rest. */
export const minimalLooseGrant = () =>
	({
		id: "grant_loose",
		entitlement_id: "ent_loose",
		internal_customer_id: newCustomer.internal_id,
		internal_feature_id: "internal_messages",
		feature_id: "messages",
		created_at: 1_700_000_000_000,
	}) satisfies InsertCustomerEntitlement;
