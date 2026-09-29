import { describe, expect, test } from "bun:test";
import {
	CusProductStatus,
	CustomerExpand,
	type FullCusProduct,
	type FullCustomerLicense,
	type FullProduct,
	type FullSubject,
	getApiCustomerLicenses,
	getApiSubscriptionsV2,
	getApiSubscriptionV2,
	type Subscription,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { customers } from "@tests/utils/fixtures/db/customers";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";

/** How a customer's plans and license pools read in the API, from the customer's rows alone. */

const STARTED_AT = 1_700_000_000_000;
const FAR_FUTURE = 4_000_000_000_000;

const contextOf = ({ expand = [] }: { expand?: string[] } = {}) => ({
	...contexts.create({}),
	expand,
});

const planOn = ({
	id = "cus_prod_pro",
	productId = "pro",
	overrides = {},
	...rest
}: {
	id?: string;
	productId?: string;
	overrides?: Partial<FullCusProduct>;
} & Partial<
	Parameters<typeof customerProducts.create>[0]
> = {}): FullCusProduct => ({
	...customerProducts.create({
		id,
		productId,
		startsAt: STARTED_AT,
		...rest,
	}),
	...overrides,
});

const oneOffPlan = (): FullCusProduct => {
	const oneOffPrice = prices.createOneOff({ id: "pr_one_off" });
	const product: FullProduct = products.createFull({
		id: "top_up",
		prices: [oneOffPrice],
	});
	return planOn({
		id: "cus_prod_top_up",
		productId: "top_up",
		product,
		customerPrices: [
			prices.createCustomer({
				price: oneOffPrice,
				customerProductId: "cus_prod_top_up",
			}),
		],
	});
};

const subjectOf = ({
	plans,
	overrides = {},
}: {
	plans: FullCusProduct[];
	overrides?: Partial<FullSubject>;
}): FullSubject => {
	const customer = customers.create({});
	return {
		subjectType: "customer",
		customerId: customer.id ?? "",
		internalCustomerId: customer.internal_id,
		customer,
		customer_products: plans,
		extra_customer_entitlements: [],
		pooled_customer_entitlements: [],
		invoices: [],
		...overrides,
	};
};

const subscriptionOf = ({
	plan,
	expand,
	overrides,
}: {
	plan: FullCusProduct;
	expand?: string[];
	overrides?: Partial<FullSubject>;
}) =>
	getApiSubscriptionV2({
		ctx: contextOf({ expand }),
		fullSubject: subjectOf({ plans: [plan], overrides }),
		customerProduct: plan,
	});

describe("one plan on a customer", () => {
	test("reads the plan, its flags and when it started", async () => {
		const { data } = await subscriptionOf({ plan: planOn() });

		expect(data).toMatchObject({
			id: "cus_prod_pro",
			plan_id: "pro",
			add_on: false,
			auto_enable: false,
			status: "active",
			past_due: false,
			canceled_at: null,
			expires_at: null,
			trial_ends_at: null,
			started_at: STARTED_AT,
			quantity: 1,
			scope: "customer",
		});
	});

	test("the caller's own id for the plan outranks ours", async () => {
		const { data } = await subscriptionOf({
			plan: planOn({ overrides: { external_id: "sub_from_caller" } }),
		});

		expect(data.id).toBe("sub_from_caller");
	});

	test("a plan held by an entity is entity scoped", async () => {
		const { data } = await subscriptionOf({
			plan: planOn({ internalEntityId: "ent_internal", entityId: "seat_1" }),
		});

		expect(data.scope).toBe("entity");
	});

	test("reports when it was cancelled and when it ends", async () => {
		const { data } = await subscriptionOf({
			plan: planOn({
				endedAt: FAR_FUTURE,
				overrides: { canceled_at: STARTED_AT + 1 },
			}),
		});

		expect(data.canceled_at).toBe(STARTED_AT + 1);
		expect(data.expires_at).toBe(FAR_FUTURE);
	});
});

describe("status", () => {
	const statusOf = async (status: CusProductStatus) =>
		(await subscriptionOf({ plan: planOn({ status }) })).data;

	test("active and trialing plans are active", async () => {
		expect((await statusOf(CusProductStatus.Active)).status).toBe("active");
		expect((await statusOf(CusProductStatus.Trialing)).status).toBe("active");
	});

	test("a past due plan is active, flagged past due", async () => {
		const data = await statusOf(CusProductStatus.PastDue);

		expect(data.status).toBe("active");
		expect(data.past_due).toBe(true);
	});

	test("scheduled and pending plans are scheduled", async () => {
		expect((await statusOf(CusProductStatus.Scheduled)).status).toBe(
			"scheduled",
		);
	});

	// Anything that is not active reads as scheduled, an expired plan included.
	test("an expired plan reads as scheduled", async () => {
		expect((await statusOf(CusProductStatus.Expired)).status).toBe("scheduled");
	});
});

describe("billing period", () => {
	const stripeSubscription = {
		id: "sub_internal",
		stripe_id: "sub_stripe",
		current_period_start: 1_700_000_000,
		current_period_end: 1_702_592_000,
	} as unknown as Subscription;

	test("has none without a subscription", async () => {
		const { data } = await subscriptionOf({ plan: planOn() });

		expect(data.current_period_start).toBeNull();
		expect(data.current_period_end).toBeNull();
	});

	test("comes from the subscription the plan names, in milliseconds", async () => {
		const { data } = await subscriptionOf({
			plan: planOn({ subscriptionIds: ["sub_stripe"] }),
			overrides: { subscriptions: [stripeSubscription] },
		});

		expect(data.current_period_start).toBe(1_700_000_000_000);
		expect(data.current_period_end).toBe(1_702_592_000_000);
	});

	test("the subscription is found by our id as well as Stripe's", async () => {
		const { data } = await subscriptionOf({
			plan: planOn({ subscriptionIds: ["sub_internal"] }),
			overrides: { subscriptions: [stripeSubscription] },
		});

		expect(data.current_period_end).toBe(1_702_592_000_000);
	});

	test("a trial with no subscription runs from its start to the trial's end", async () => {
		const { data } = await subscriptionOf({
			plan: planOn({ overrides: { trial_ends_at: FAR_FUTURE } }),
		});

		expect(data.trial_ends_at).toBe(FAR_FUTURE);
		expect(data.current_period_start).toBe(STARTED_AT);
		expect(data.current_period_end).toBe(FAR_FUTURE);
	});

	test("a trial that has ended is not reported", async () => {
		const { data } = await subscriptionOf({
			plan: planOn({ overrides: { trial_ends_at: STARTED_AT } }),
		});

		expect(data.trial_ends_at).toBeNull();
	});
});

describe("the plan object", () => {
	test("is left out unless asked for", async () => {
		const { data } = await subscriptionOf({ plan: planOn() });

		expect(data.plan).toBeUndefined();
	});

	test("rides along on a subscription when subscriptions.plan is expanded", async () => {
		const { data } = await subscriptionOf({
			plan: planOn(),
			expand: [CustomerExpand.SubscriptionsPlan],
		});

		expect(data.plan?.id).toBe("pro");
	});

	test("rides along when the expand is already scoped to the plan", async () => {
		const { data } = await subscriptionOf({
			plan: planOn(),
			expand: ["plan"],
		});

		expect(data.plan?.id).toBe("pro");
	});

	test("a one-off purchase answers to purchases.plan, not subscriptions.plan", async () => {
		const subscriptions = await subscriptionOf({
			plan: oneOffPlan(),
			expand: [CustomerExpand.SubscriptionsPlan],
		});
		const purchases = await subscriptionOf({
			plan: oneOffPlan(),
			expand: [CustomerExpand.PurchasesPlan],
		});

		expect(subscriptions.data.plan).toBeUndefined();
		expect(purchases.data.plan?.id).toBe("top_up");
	});
});

describe("legacy data", () => {
	test("carries the first subscription id and the plan's options", async () => {
		const options = [{ feature_id: "seats", quantity: 5 }];
		const { legacyData } = await subscriptionOf({
			plan: planOn({
				subscriptionIds: ["sub_stripe", "sub_other"],
				options: options as FullCusProduct["options"],
			}),
		});

		expect(legacyData).toEqual({ subscription_id: "sub_stripe", options });
	});

	test("has no subscription id when the plan has none", async () => {
		const { legacyData } = await subscriptionOf({ plan: planOn() });

		expect(legacyData.subscription_id).toBeUndefined();
	});
});

describe("all of a customer's plans", () => {
	test("recurring plans are subscriptions, one-off plans are purchases", async () => {
		const result = await getApiSubscriptionsV2({
			ctx: contextOf(),
			fullSubject: subjectOf({ plans: [planOn(), oneOffPlan()] }),
		});

		expect(result.subscriptions.map(({ plan_id }) => plan_id)).toEqual(["pro"]);
		expect(result.purchases.map(({ plan_id }) => plan_id)).toEqual(["top_up"]);
		expect(Object.keys(result.legacyData).sort()).toEqual(["pro", "top_up"]);
	});

	test("a purchase keeps only what a purchase has", async () => {
		const { purchases } = await getApiSubscriptionsV2({
			ctx: contextOf(),
			fullSubject: subjectOf({ plans: [oneOffPlan()] }),
		});

		expect(purchases[0]).toEqual({
			plan: undefined,
			plan_id: "top_up",
			expires_at: null,
			started_at: STARTED_AT,
			quantity: 1,
			scope: "customer",
		});
	});

	test("a customer also lists the plans its entities hold", async () => {
		const entityPlan = planOn({ id: "cus_prod_seat", productId: "seat" });
		const { subscriptions } = await getApiSubscriptionsV2({
			ctx: contextOf(),
			fullSubject: subjectOf({
				plans: [planOn()],
				overrides: { aggregated_customer_products: [entityPlan] },
			}),
		});

		expect(subscriptions.map(({ plan_id }) => plan_id)).toEqual([
			"pro",
			"seat",
		]);
	});

	test("an entity lists only its own plans", async () => {
		const otherPlan = planOn({ id: "cus_prod_seat", productId: "seat" });
		const { subscriptions } = await getApiSubscriptionsV2({
			ctx: contextOf(),
			fullSubject: subjectOf({
				plans: [planOn()],
				overrides: {
					subjectType: "entity",
					aggregated_customer_products: [otherPlan],
				},
			}),
		});

		expect(subscriptions.map(({ plan_id }) => plan_id)).toEqual(["pro"]);
	});
});

describe("license pools", () => {
	const poolOn = ({
		licensePlanId,
		granted = 10,
		remaining = 4,
		linked = true,
	}: {
		licensePlanId: string;
		granted?: number;
		remaining?: number;
		linked?: boolean;
	}): FullCustomerLicense =>
		({
			id: `cl_${licensePlanId}`,
			granted,
			remaining,
			paid_quantity: 6,
			planLicense: linked
				? {
						product: products.createFull({
							id: licensePlanId,
							name: `${licensePlanId} plan`,
						}),
					}
				: null,
		}) as unknown as FullCustomerLicense;

	const parentWith = ({
		productId,
		pools,
		status,
	}: {
		productId: string;
		pools: FullCustomerLicense[];
		status?: CusProductStatus;
	}) =>
		planOn({
			id: `cus_prod_${productId}`,
			productId,
			status,
			overrides: { customer_licenses: pools },
		});

	const poolsOf = (plans: FullCusProduct[]) =>
		getApiCustomerLicenses({ customerProducts: plans });

	test("a pool reads as its two plans and its counts", () => {
		const pools = poolsOf([
			parentWith({
				productId: "pro",
				pools: [poolOn({ licensePlanId: "seat" })],
			}),
		]);

		expect(pools).toEqual([
			{
				license_plan_id: "seat",
				parent_plan_id: "pro",
				license_plan_name: "seat plan",
				granted: 10,
				usage: 6,
				remaining: 4,
				paid_quantity: 6,
			},
		]);
	});

	test("a plan with no pools has none", () => {
		expect(poolsOf([planOn()])).toEqual([]);
	});

	test("only live parents count: active and past due, never scheduled or expired", () => {
		const pools = poolsOf([
			parentWith({
				productId: "active",
				pools: [poolOn({ licensePlanId: "seat" })],
			}),
			parentWith({
				productId: "past_due",
				status: CusProductStatus.PastDue,
				pools: [poolOn({ licensePlanId: "seat" })],
			}),
			parentWith({
				productId: "scheduled",
				status: CusProductStatus.Scheduled,
				pools: [poolOn({ licensePlanId: "seat" })],
			}),
			parentWith({
				productId: "expired",
				status: CusProductStatus.Expired,
				pools: [poolOn({ licensePlanId: "seat" })],
			}),
		]);

		expect(pools.map(({ parent_plan_id }) => parent_plan_id)).toEqual([
			"active",
			"past_due",
		]);
	});

	test("a pool whose link is gone is skipped", () => {
		const pools = poolsOf([
			parentWith({
				productId: "pro",
				pools: [
					poolOn({ licensePlanId: "seat", linked: false }),
					poolOn({ licensePlanId: "viewer" }),
				],
			}),
		]);

		expect(pools.map(({ license_plan_id }) => license_plan_id)).toEqual([
			"viewer",
		]);
	});

	test("pools are ordered by parent plan, then by license plan", () => {
		const pools = poolsOf([
			parentWith({
				productId: "team",
				pools: [poolOn({ licensePlanId: "seat" })],
			}),
			parentWith({
				productId: "pro",
				pools: [
					poolOn({ licensePlanId: "viewer" }),
					poolOn({ licensePlanId: "seat" }),
				],
			}),
		]);

		expect(
			pools.map(
				({ parent_plan_id, license_plan_id }) =>
					`${parent_plan_id}/${license_plan_id}`,
			),
		).toEqual(["pro/seat", "pro/viewer", "team/seat"]);
	});
});
