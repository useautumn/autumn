/** QA customers for the Set Plans review screen; run by hand, then open each in the dashboard. */

import { test } from "bun:test";
import { BillingInterval, ms, type SetPlansParamsV0Input } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { CusService } from "@/internal/customers/CusService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";

const proPlan = () =>
	products.pro({ items: [items.monthlyMessages({ includedUsage: 100 })] });
const premiumPlan = () =>
	products.base({
		id: "premium",
		items: [
			items.monthlyMessages({ includedUsage: 500 }),
			items.monthlyPrice({ price: 50 }),
		],
	});

/** Taylor's Mintlify shape: an entity's annual plan started before its subscription, then a renewal is scheduled. */
const seedMintlify = async ({
	customerId,
	savesRepeatedPhase,
}: {
	customerId: string;
	savesRepeatedPhase: boolean;
}) => {
	const enterprise = products.base({
		id: "enterprise",
		items: [
			items.annualPrice({ price: 18000 }),
			items.consumable({ featureId: TestFeature.Words, price: 0.01 }),
			items.dashboard(),
		],
	});
	const { autumnV2_4, ctx, advancedTo, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [enterprise] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: enterprise.id, entityIndex: 0 }),
			s.advanceTestClock({ days: 20 }),
		],
	});
	const entityId = entities[0]!.id;
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		withEntities: true,
	});
	const live = fullCustomer.customer_products.find(
		(customerProduct) =>
			customerProduct.product.id === enterprise.id &&
			customerProduct.status === "active",
	)!;
	const startsAt = live.starts_at - ms.days(15);
	await CusProductService.update({
		ctx,
		cusProductId: live.id,
		updates: { starts_at: startsAt },
	});
	await deleteCachedFullCustomer({ ctx, customerId, skipGuard: true });

	const renewal = (renewalStart: number) => ({
		starts_at: renewalStart,
		billing_cycle_anchor: "phase_start" as const,
		plans: [
			{
				plan_id: enterprise.id,
				entity_id: entityId,
				customize: {
					price: { amount: 20000, interval: BillingInterval.Year },
				},
			},
		],
	});
	const renewalStart = advancedTo + ms.days(110);
	await autumnV2_4.billing.setPlans({
		customer_id: customerId,
		phases: [
			{
				starts_at: startsAt,
				plans: [{ plan_id: enterprise.id, entity_id: entityId }],
			},
			renewal(renewalStart),
			...(savesRepeatedPhase ? [renewal(renewalStart + ms.days(365))] : []),
		],
	});
};

test.concurrent("QA 1: Mintlify, renewal repeated a year later (saved)", () =>
	seedMintlify({ customerId: "qa-review-mintlify", savesRepeatedPhase: true }),
);

test.concurrent("QA 2: Mintlify, renewal saved, repeat not added yet", () =>
	seedMintlify({
		customerId: "qa-review-mintlify-add",
		savesRepeatedPhase: false,
	}),
);

test.concurrent("QA 3: pro mid-cycle with usage, for an upgrade now", async () => {
	await initScenario({
		customerId: "qa-review-upgrade",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proPlan(), premiumPlan()] }),
		],
		actions: [
			s.billing.attach({ productId: "pro" }),
			s.track({ featureId: TestFeature.Messages, value: 40, timeout: 2000 }),
			s.advanceTestClock({ days: 10 }),
		],
	});
});

test.concurrent("QA 4: pro with a saved schedule of two future phases", async () => {
	const pro = proPlan();
	const premium = premiumPlan();
	const { autumnV2_4, customerId, advancedTo } = await initScenario({
		customerId: "qa-review-removed-phase",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: "pro" })],
	});
	const params: SetPlansParamsV0Input = {
		customer_id: customerId,
		phases: [
			{ starts_at: "now", plans: [{ plan_id: pro.id }] },
			{
				starts_at: advancedTo + ms.days(45),
				plans: [{ plan_id: premium.id }],
			},
			{
				starts_at: advancedTo + ms.days(100),
				plans: [{ plan_id: pro.id }],
			},
		],
	};
	await autumnV2_4.billing.setPlans(params);
});

test.concurrent("QA 5: pro on a 14-day trial", async () => {
	await initScenario({
		customerId: "qa-review-trial",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({
				list: [
					products.proWithTrial({
						items: [items.monthlyMessages({ includedUsage: 100 })],
						trialDays: 14,
					}),
					premiumPlan(),
				],
			}),
		],
		actions: [s.billing.attach({ productId: "pro-trial" })],
	});
});

test.concurrent("QA 6: two entities, each on pro", async () => {
	await initScenario({
		customerId: "qa-review-entities",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proPlan(), premiumPlan()] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: "pro", entityIndex: 0 }),
			s.billing.attach({ productId: "pro", entityIndex: 1 }),
		],
	});
});

test.concurrent("QA 7: pro with metered words and usage", async () => {
	await initScenario({
		customerId: "qa-review-usage",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({
				list: [
					products.pro({
						items: [
							items.monthlyMessages({ includedUsage: 100 }),
							items.consumable({
								featureId: TestFeature.Words,
								price: 0.01,
								billingUnits: 100,
							}),
						],
					}),
					premiumPlan(),
				],
			}),
		],
		actions: [
			s.billing.attach({ productId: "pro" }),
			s.track({ featureId: TestFeature.Words, value: 2500, timeout: 2000 }),
		],
	});
});
