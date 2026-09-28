import { describe, expect, test } from "bun:test";
import {
	AppEnv,
	type FullCusProduct,
	type FullCustomer,
	type FullSubject,
	ProcessorType,
	type Subscription,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { customers } from "@tests/utils/fixtures/db/customers";
import type { RequestContext } from "@/honoUtils/HonoEnv";
import { getApiSubscription } from "@/internal/customers/cusUtils/apiCusUtils/getApiSubscription/getApiSubscription";
import { getApiSubscriptionV2 } from "@/internal/customers/cusUtils/getApiCustomerV2/getApiSubscription/getApiSubscriptionV2";

const ctx = {
	...contexts.create({}),
	expand: [],
} as unknown as RequestContext;

const RC_START_MS = 1_780_000_000_000;
const RC_END_MS = RC_START_MS + 30 * 24 * 60 * 60 * 1000;
const STRIPE_SUB_ID = "sub_stripe_test";
const STRIPE_START_S = 1_780_000_000;
const STRIPE_END_S = STRIPE_START_S + 30 * 24 * 60 * 60;

const stripeSubscription: Subscription = {
	id: "sub_autumn_test",
	stripe_id: STRIPE_SUB_ID,
	stripe_schedule_id: null,
	created_at: Date.now(),
	usage_features: [],
	org_id: "org_test",
	current_period_start: STRIPE_START_S,
	current_period_end: STRIPE_END_S,
	billing_cycle_anchor_seconds: STRIPE_START_S,
	env: AppEnv.Sandbox,
};

const revenueCatPlan = ({
	withPeriod,
}: {
	withPeriod: boolean;
}): FullCusProduct => ({
	...customerProducts.create({ processorType: ProcessorType.RevenueCat }),
	processor: {
		type: ProcessorType.RevenueCat,
		id: "rc_sub_test",
		...(withPeriod
			? { current_period_start: RC_START_MS, current_period_end: RC_END_MS }
			: {}),
	},
});

const stripePlan = (): FullCusProduct =>
	customerProducts.create({ subscriptionIds: [STRIPE_SUB_ID] });

const periodFromBothBuilders = async ({
	customerProduct,
}: {
	customerProduct: FullCusProduct;
}) => {
	const fullCus = {
		...customers.create({ customerProducts: [customerProduct] }),
		subscriptions: [stripeSubscription],
	} as FullCustomer;

	const legacy = await getApiSubscription({
		ctx,
		fullCus,
		cusProduct: customerProduct,
	});
	const v2 = await getApiSubscriptionV2({
		ctx,
		fullSubject: fullCus as unknown as FullSubject,
		customerProduct,
	});

	return [legacy.data, v2.data].map((data) => ({
		start: data.current_period_start,
		end: data.current_period_end,
	}));
};

describe("API subscription current period", () => {
	test("RevenueCat plan returns the stored store period in ms", async () => {
		const periods = await periodFromBothBuilders({
			customerProduct: revenueCatPlan({ withPeriod: true }),
		});

		for (const period of periods) {
			expect(period).toEqual({ start: RC_START_MS, end: RC_END_MS });
		}
	});

	test("RevenueCat plan without a stored period stays null", async () => {
		const periods = await periodFromBothBuilders({
			customerProduct: revenueCatPlan({ withPeriod: false }),
		});

		for (const period of periods) {
			expect(period).toEqual({ start: null, end: null });
		}
	});

	test("Stripe plan still reads its subscription row", async () => {
		const periods = await periodFromBothBuilders({
			customerProduct: stripePlan(),
		});

		for (const period of periods) {
			expect(period).toEqual({
				start: STRIPE_START_S * 1000,
				end: STRIPE_END_S * 1000,
			});
		}
	});
});
