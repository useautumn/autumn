import {
	BillingVersion,
	type CreateScheduleBillingContext,
	CusProductStatus,
	type Entity,
	type FullCusProduct,
	type FullProduct,
	ms,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import type { TimelineDiff } from "@/internal/billing/v2/actions/setPlans/timeline/types/timelineDiff";

export const ctx = contexts.create({});
export const NOW = 1_800_000_000_000;
export const PHASE_B = NOW + ms.days(30);
export const PHASE_B2 = NOW + ms.days(40);

export const entity = (internalId: string) =>
	({ internal_id: internalId, id: internalId }) as unknown as Entity;

export const paidProduct = ({
	id,
	group = "main",
	isAddOn = false,
}: {
	id: string;
	group?: string;
	isAddOn?: boolean;
}): FullProduct => ({
	...products.createFull({
		id,
		isAddOn,
		prices: [prices.createFixed({ id: `price_${id}` })],
	}),
	group,
});

export const running = ({
	product,
	status = CusProductStatus.Active,
	startsAt = NOW - ms.days(10),
	endedAt = null,
	internalEntityId,
	subscriptionIds = [],
}: {
	product: FullProduct;
	status?: CusProductStatus;
	startsAt?: number;
	endedAt?: number | null;
	internalEntityId?: string;
	subscriptionIds?: string[];
}): FullCusProduct =>
	customerProducts.create({
		id: `cus_prod_${product.id}`,
		productId: product.id,
		product,
		status,
		startsAt,
		endedAt,
		internalEntityId,
		subscriptionIds,
		customerPrices: product.prices.map((price) =>
			prices.createCustomer({
				price,
				customerProductId: `cus_prod_${product.id}`,
			}),
		),
	});

export type PlanInput = { fullProduct: FullProduct; entity?: Entity };

export const buildContext = ({
	existing,
	opening,
	later = [],
	stripeSubscriptionScope,
}: {
	existing: FullCusProduct[];
	opening: PlanInput[];
	later?: { startsAt: number; plans: PlanInput[] }[];
	stripeSubscriptionScope?: CreateScheduleBillingContext["stripeSubscriptionScope"];
}): CreateScheduleBillingContext => {
	const billingContext = contexts.createBilling({
		customerProducts: existing,
		fullProducts: opening.map(({ fullProduct }) => fullProduct),
		currentEpochMs: NOW,
		billingVersion: BillingVersion.V2,
	});
	return {
		...billingContext,
		productContexts: opening.map(({ fullProduct, entity: planEntity }) => ({
			fullProduct,
			customPrices: [],
			customEnts: [],
			featureQuantities: [],
			fullCustomer: { ...billingContext.fullCustomer, entity: planEntity },
		})),
		checkoutMode: null,
		immediatePhase: { starts_at: NOW, plans: [] },
		futurePhases: later.map(({ startsAt }) => ({
			starts_at: startsAt,
			plans: [],
		})),
		scheduledPhaseContexts: later.map(({ startsAt, plans }) => ({
			startsAt,
			endsAt: undefined,
			productContexts: plans.map(({ fullProduct, entity: planEntity }) => ({
				fullProduct,
				customPrices: [],
				customEntitlements: [],
				featureQuantities: [],
				entity: planEntity,
			})),
		})),
		stripeSubscriptionScope,
	};
};

export const momentName = (at: number | null) => {
	if (at === null) return "never";
	if (at === NOW) return "now";
	if (at === PHASE_B) return "B";
	if (at === PHASE_B2) return "B2";
	return String(at);
};

export const describeOperations = (diff: TimelineDiff) =>
	diff.operations
		.flatMap((operation) => {
			switch (operation.type) {
				case "keep":
					return [];
				case "retime":
					return [
						`retime:${operation.customerProductId}:${momentName(operation.endsAt)}`,
					];
				case "expire":
				case "delete":
					return [`${operation.type}:${operation.customerProductId}`];
				case "insert": {
					const segment = diff.timeline.find(
						({ id }) => id === operation.segmentId,
					);
					return [
						`insert:${segment?.planId}@${momentName(segment?.startsAt ?? null)}`,
					];
				}
				default: {
					const unreachable: never = operation;
					return unreachable;
				}
			}
		})
		.sort();
