import { describe, expect, test } from "bun:test";
import { rollovers } from "@tests/utils/fixtures/db/rollovers.js";
import { workerCanApplyBillingPlan } from "@/internal/balanceWorker/billingPlan/routing/billingPlanRoutesToWorker.js";
import {
	createCustomerPlan,
	defaultProduct,
	expiredDefaultUpdate,
	linkBackPlan,
	newCustomer,
} from "./billingPlanFixtures.js";

describe("workerCanApplyBillingPlan", () => {
	test("create, the Stripe customer link and the subscription link-back all go to the worker", () => {
		expect(
			workerCanApplyBillingPlan({ autumnBillingPlan: createCustomerPlan() }),
		).toBe(true);
		expect(
			workerCanApplyBillingPlan({
				autumnBillingPlan: {
					customerId: "cus_test",
					insertCustomerProducts: [],
					updateCustomer: {
						customer: newCustomer,
						updates: { processor: { id: "cus_stripe_1", type: "stripe" } },
					},
				},
			}),
		).toBe(true);
		expect(
			workerCanApplyBillingPlan({ autumnBillingPlan: linkBackPlan() }),
		).toBe(true);
	});

	test("facets the worker does not hold no longer keep the plan off it: they land in Postgres after", () => {
		expect(
			workerCanApplyBillingPlan({
				autumnBillingPlan: {
					...createCustomerPlan(),
					lockCustomerCurrency: {
						internalCustomerId: newCustomer.internal_id,
						currency: "usd",
					},
					lineItems: [],
				},
			}),
		).toBe(true);
	});

	test("a top-up goes to the worker only when it names its purchase", () => {
		const deltas = [
			{ cusEntId: "cus_ent_1", featureId: "messages", delta: 50 },
		];
		expect(
			workerCanApplyBillingPlan({
				autumnBillingPlan: {
					...linkBackPlan(),
					autoTopupRebalance: { deltas },
				},
			}),
		).toBe(false);
		expect(
			workerCanApplyBillingPlan({
				autumnBillingPlan: {
					...linkBackPlan(),
					autoTopupRebalance: {
						deltas,
						customerEntitlementId: "cus_ent_1",
						featureId: "messages",
						quantity: 50,
						creditedCustomerEntitlementId: "cus_ent_1",
					},
				},
			}),
		).toBe(true);
	});

	test("a plan must name exactly one customer, by its id", () => {
		expect(
			workerCanApplyBillingPlan({
				autumnBillingPlan: {
					...createCustomerPlan(),
					insertCustomer: { ...newCustomer, id: null },
				},
			}),
		).toBe(false);
		expect(
			workerCanApplyBillingPlan({
				autumnBillingPlan: {
					...createCustomerPlan(),
					insertCustomerProducts: [
						{ ...defaultProduct(), customer_id: "cus_other" },
					],
				},
			}),
		).toBe(false);
		expect(
			workerCanApplyBillingPlan({
				autumnBillingPlan: {
					customerId: "cus_test",
					insertCustomerProducts: [],
				},
			}),
		).toBe(false);
	});

	test("an entity's product goes to the worker when the plan can name the entity by its id", () => {
		const withProduct = (customerProduct: ReturnType<typeof defaultProduct>) =>
			workerCanApplyBillingPlan({
				autumnBillingPlan: {
					...createCustomerPlan(),
					insertCustomerProducts: [customerProduct],
				},
			});
		const onEntity = {
			...defaultProduct(),
			internal_entity_id: "ent_internal_1",
			entity_id: "ent_1",
		};
		expect(withProduct(onEntity)).toBe(true);
		expect(withProduct({ ...onEntity, entity_id: null })).toBe(false);

		const [customerEntitlement] = defaultProduct().customer_entitlements;
		if (!customerEntitlement) throw new Error("fixture has no entitlement");
		expect(
			withProduct({
				...defaultProduct(),
				customer_entitlements: [
					{
						...customerEntitlement,
						internal_entity_id: "ent_internal_unnamed",
					},
				],
			}),
		).toBe(false);
	});

	test("a license seat keeps the plan on Postgres; license pools and carried rollovers do not", () => {
		const withProduct = (customerProduct: ReturnType<typeof defaultProduct>) =>
			workerCanApplyBillingPlan({
				autumnBillingPlan: {
					...createCustomerPlan(),
					insertCustomerProducts: [customerProduct],
				},
			});
		const [customerEntitlement] = defaultProduct().customer_entitlements;
		if (!customerEntitlement) throw new Error("fixture has no entitlement");

		expect(
			withProduct({
				...defaultProduct(),
				customer_license_link_id: "license_link_1",
			}),
		).toBe(false);
		expect(
			withProduct({
				...defaultProduct(),
				customer_entitlements: [
					{
						...customerEntitlement,
						rollovers: [
							rollovers.create({
								cusEntId: customerEntitlement.id,
								balance: 5,
							}),
						],
					},
				],
			}),
		).toBe(true);
	});

	test("an update that repoints schedule phases goes to the worker; the phases land in Postgres after", () => {
		const successor = { ...defaultProduct(), id: "cus_prod_successor" };
		expect(
			workerCanApplyBillingPlan({
				autumnBillingPlan: {
					customerId: "cus_test",
					insertCustomerProducts: [successor],
					updateCustomerProducts: [expiredDefaultUpdate()],
				},
			}),
		).toBe(true);
	});
});
