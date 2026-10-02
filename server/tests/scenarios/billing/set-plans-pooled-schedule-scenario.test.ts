/** A pooled allowance across entities with saved future phases, for hand QA of the Set Plans review. */

import { test } from "bun:test";
import { ms } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";

const NEXT_PHASE_DAYS = 30;
const LATER_PHASE_DAYS = 395;
const PREPAID_MESSAGES = 240_000;

const enterprise = () =>
	products.base({
		id: "qa-enterprise",
		items: [
			items.annualPrice({ price: 22_000 }),
			{ ...items.monthlyWords({ includedUsage: 10_000 }), pooled: true },
			items.volumePrepaidMessages({
				billingUnits: 1,
				tiers: [
					{ to: 100_000, amount: 0.01 },
					{ to: "inf", amount: 0.008 },
				],
			}),
		],
	});

const hobby = () =>
	products.base({
		id: "qa-hobby",
		isAddOn: true,
		items: [items.monthlyWords({ includedUsage: 100 })],
	});

const enterprisePlan = ({
	planId,
	entityId,
	yearlyPrice,
}: {
	planId: string;
	entityId: string;
	yearlyPrice?: number;
}) => ({
	plan_id: planId,
	entity_id: entityId,
	feature_quantities: [
		{ feature_id: TestFeature.Messages, quantity: PREPAID_MESSAGES },
	],
	...(yearlyPrice !== undefined && {
		customize: { price: { amount: yearlyPrice, interval: "year" as const } },
	}),
});

test("QA P1: pooled allowance on two entities, main entity rescheduled twice, free add-on on a third", async () => {
	const enterprisePlanDef = enterprise();
	const hobbyPlanDef = hobby();
	const { customerId, autumnV2_4 } = await initScenario({
		customerId: "qa-pooled-schedule",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [enterprisePlanDef, hobbyPlanDef] }),
			s.entities({ count: 3, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	const docsEnterprise = enterprisePlan({
		planId: enterprisePlanDef.id,
		entityId: "ent-2",
	});
	const tempHobby = { plan_id: hobbyPlanDef.id, entity_id: "ent-3" };

	await autumnV2_4.billing.setPlans({
		customer_id: customerId,
		unscheduled_plans: [docsEnterprise, tempHobby],
		phases: [
			{
				starts_at: "now",
				plans: [
					enterprisePlan({ planId: enterprisePlanDef.id, entityId: "ent-1" }),
				],
			},
			{
				starts_at: Date.now() + ms.days(NEXT_PHASE_DAYS),
				plans: [
					enterprisePlan({
						planId: enterprisePlanDef.id,
						entityId: "ent-1",
						yearlyPrice: 35_000,
					}),
				],
			},
			{
				starts_at: Date.now() + ms.days(LATER_PHASE_DAYS),
				plans: [
					enterprisePlan({
						planId: enterprisePlanDef.id,
						entityId: "ent-1",
						yearlyPrice: 45_000,
					}),
				],
			},
		],
	});
});
