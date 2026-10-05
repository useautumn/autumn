import { describe, expect, test } from "bun:test";
import {
	type AutumnBillingPlan,
	CusProductStatus,
	type FullCusProduct,
	ms,
	ProcessorType,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { stripeSubscriptions } from "@tests/utils/fixtures/stripe/subscriptions";
import type Stripe from "stripe";
import { buildStripeSubscriptionScheduleAction } from "@/internal/billing/v2/providers/stripe/actionBuilders/buildStripeSubscriptionScheduleAction";
import {
	createCustomerPricesForProduct,
	createProductWithAllPriceTypes,
	expectPhaseItems,
	getStripePriceIds,
} from "../stripeSubscriptionTestHelpers";

const NOW_MS = Date.UTC(2026, 9, 5);
const PREMIUM_STARTS_AT = NOW_MS + ms.months(1);
const PRO_STARTED_AT = NOW_MS - ms.months(1);

const pro = createProductWithAllPriceTypes({
	productId: "pro",
	productName: "Pro",
	customerProductId: "cus_prod_pro",
});
const premium = createProductWithAllPriceTypes({
	productId: "premium",
	productName: "Premium",
	customerProductId: "cus_prod_premium",
});

const customerProductFor = ({
	product,
	status,
	startsAt,
	endedAt,
	subscriptionIds,
	processorType,
}: {
	product: typeof pro;
	status: CusProductStatus;
	startsAt: number;
	endedAt?: number;
	subscriptionIds: string[];
	processorType?: ProcessorType;
}) => {
	const customerProductId = `cus_prod_${product.product.id}`;
	return customerProducts.create({
		id: customerProductId,
		productId: product.product.id,
		product: product.product,
		customerPrices: createCustomerPricesForProduct({
			prices: product.allPrices,
			customerProductId,
		}),
		customerEntitlements: product.allEntitlements,
		options: product.allOptions,
		status,
		startsAt,
		endedAt,
		subscriptionIds,
		processorType,
	});
};

const emptyPatch = (customerProduct: FullCusProduct) => ({
	customerProduct,
	insertCustomerEntitlements: [],
	insertCustomerPrices: [],
	deleteCustomerEntitlements: [],
	deleteCustomerPrices: [],
});

const buildScheduleAction = ({
	finalCustomerProducts,
	insertCustomerProducts = [],
	patchedCustomerProducts = [],
	stripeSubscriptionId,
	stripeSubscriptionSchedule,
}: {
	finalCustomerProducts: FullCusProduct[];
	insertCustomerProducts?: FullCusProduct[];
	patchedCustomerProducts?: FullCusProduct[];
	stripeSubscriptionId?: string;
	stripeSubscriptionSchedule?: Stripe.SubscriptionSchedule;
}) => {
	const autumnBillingPlan: AutumnBillingPlan = {
		customerId: "cus_123",
		insertCustomerProducts,
		patchCustomerProducts: patchedCustomerProducts.map(emptyPatch),
	};
	return buildStripeSubscriptionScheduleAction({
		ctx: contexts.create({ features: [] }),
		billingContext: contexts.createBilling({
			customerProducts: finalCustomerProducts,
			fullProducts: [pro.product, premium.product],
			currentEpochMs: NOW_MS,
			stripeSubscription: stripeSubscriptionId
				? stripeSubscriptions.create({ id: stripeSubscriptionId })
				: undefined,
			stripeSubscriptionSchedule,
		}),
		autumnBillingPlan,
		finalCustomerProducts,
	});
};

describe("buildStripeSubscriptionScheduleAction", () => {
	test("a patched row on the edited subscription builds the same schedule as before", () => {
		const livePro = customerProductFor({
			product: pro,
			status: CusProductStatus.Active,
			startsAt: PRO_STARTED_AT,
			endedAt: PREMIUM_STARTS_AT,
			subscriptionIds: ["sub_live"],
		});
		const scheduledPremium = customerProductFor({
			product: premium,
			status: CusProductStatus.Scheduled,
			startsAt: PREMIUM_STARTS_AT,
			subscriptionIds: ["sub_live"],
		});
		const finalCustomerProducts = [livePro, scheduledPremium];

		const unpatched = buildScheduleAction({
			finalCustomerProducts,
			insertCustomerProducts: [scheduledPremium],
			stripeSubscriptionId: "sub_live",
		});
		const patched = buildScheduleAction({
			finalCustomerProducts,
			insertCustomerProducts: [scheduledPremium],
			patchedCustomerProducts: [livePro],
			stripeSubscriptionId: "sub_live",
		});

		expect(patched).toEqual(unpatched);
		expect(patched.scheduleAction?.type).toBe("create");
	});

	test("unlinked rows the plan doesn't write stay off the schedule", () => {
		const livePro = customerProductFor({
			product: pro,
			status: CusProductStatus.Active,
			startsAt: PRO_STARTED_AT,
			endedAt: PREMIUM_STARTS_AT,
			subscriptionIds: [],
		});
		const scheduledPremium = customerProductFor({
			product: premium,
			status: CusProductStatus.Scheduled,
			startsAt: PREMIUM_STARTS_AT,
			subscriptionIds: [],
		});

		expect(
			buildScheduleAction({
				finalCustomerProducts: [livePro, scheduledPremium],
			}),
		).toEqual({});
	});

	test("rows a recreate unlinks and patches build a new schedule with both phases", () => {
		const livePro = customerProductFor({
			product: pro,
			status: CusProductStatus.Active,
			startsAt: PRO_STARTED_AT,
			endedAt: PREMIUM_STARTS_AT,
			subscriptionIds: [],
		});
		const scheduledPremium = customerProductFor({
			product: premium,
			status: CusProductStatus.Scheduled,
			startsAt: PREMIUM_STARTS_AT,
			subscriptionIds: [],
		});

		const { scheduleAction } = buildScheduleAction({
			finalCustomerProducts: [livePro, scheduledPremium],
			patchedCustomerProducts: [livePro, scheduledPremium],
		});

		if (scheduleAction?.type !== "create") {
			throw new Error(`expected a create action, got ${scheduleAction?.type}`);
		}
		const phases = scheduleAction.params.phases ?? [];
		expect(phases).toHaveLength(2);
		expectPhaseItems(phases[0]!.items, getStripePriceIds(pro));
		expectPhaseItems(phases[1]!.items, getStripePriceIds(premium));
	});

	test("a patched row linked to another subscription stays off the schedule", () => {
		const otherSubscriptionPro = customerProductFor({
			product: pro,
			status: CusProductStatus.Active,
			startsAt: PRO_STARTED_AT,
			endedAt: PREMIUM_STARTS_AT,
			subscriptionIds: ["sub_other"],
		});

		expect(
			buildScheduleAction({
				finalCustomerProducts: [otherSubscriptionPro],
				patchedCustomerProducts: [otherSubscriptionPro],
			}),
		).toEqual({});
	});

	test("a patched row managed by another processor stays off the schedule", () => {
		const revenueCatPro = customerProductFor({
			product: pro,
			status: CusProductStatus.Active,
			startsAt: PRO_STARTED_AT,
			endedAt: PREMIUM_STARTS_AT,
			subscriptionIds: [],
			processorType: ProcessorType.RevenueCat,
		});

		expect(
			buildScheduleAction({
				finalCustomerProducts: [revenueCatPro],
				patchedCustomerProducts: [revenueCatPro],
			}),
		).toEqual({});
	});

	test("starting a pending schedule's plan now cancels the schedule rather than releasing it", () => {
		const pendingSchedule = {
			id: "sub_sched_pending",
			status: "not_started",
			end_behavior: "release",
			phases: [],
		} as unknown as Stripe.SubscriptionSchedule;
		const startedPro = customerProductFor({
			product: pro,
			status: CusProductStatus.Active,
			startsAt: NOW_MS,
			subscriptionIds: [],
		});

		const { scheduleAction } = buildScheduleAction({
			finalCustomerProducts: [startedPro],
			insertCustomerProducts: [startedPro],
			stripeSubscriptionSchedule: pendingSchedule,
		});

		expect(scheduleAction).toEqual({
			type: "cancel",
			stripeSubscriptionScheduleId: pendingSchedule.id,
		});
	});
});
