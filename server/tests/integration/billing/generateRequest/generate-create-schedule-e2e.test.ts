/**
 * End-to-end coverage for editing a persisted schedule through billing.generate.
 * The generated request must preview, execute, and persist the requested version
 * while preserving every untouched phase and the targeted phase's custom price.
 */

import { expect, test } from "bun:test";
import {
	BillingInterval,
	type CreateScheduleParamsV0,
	CreateScheduleParamsV0Schema,
	ms,
	type ProductItem,
	schedules,
} from "@autumn/shared";
import {
	getCustomerProductEntitlementBalances,
	getCustomerProductPriceAmounts,
	getRequiredScheduleId,
} from "@tests/integration/billing/create-schedule/utils/createScheduleTestHelpers.js";
import { messagesItem } from "@tests/integration/catalog-v2/plans/licenses/utils/seedLicensePlans.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { productItemsToCustomizePlanV1 } from "@utils/productV2Utils/productItemUtils/convertProductItem/productItemsToCustomizePlanV1.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { setupGenerationContext } from "@/internal/billing/v2/actions/generateRequest/setup/setupGenerationContext.js";
import { CusService } from "@/internal/customers/CusService.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { hydrateCustomerWithSchedules } from "@/internal/customers/cusUtils/getFullCustomerSchedule.js";
import { resetCatalogPlans } from "../../../scenarios/catalog/utils/catalogScenario.js";

const GENERATE_PATH = "/agent.generate_billing_request";
const planId = "generate-schedule-e2e-plan";

const generatedRequestToApi = ({
	ctx,
	request,
}: {
	ctx: Parameters<typeof productItemsToCustomizePlanV1>[0]["ctx"];
	request: Record<string, unknown>;
}): CreateScheduleParamsV0 => {
	const plansToApi = (plans: Record<string, unknown>[]) =>
		plans.map(({ items, ...plan }) => ({
			...plan,
			...(Array.isArray(items)
				? {
						customize: productItemsToCustomizePlanV1({
							ctx,
							items: items as ProductItem[],
						}),
					}
				: {}),
		}));
	return CreateScheduleParamsV0Schema.parse({
		...request,
		phases: (request.phases as Record<string, unknown>[]).map((phase) => ({
			...phase,
			plans: plansToApi(phase.plans as Record<string, unknown>[]),
		})),
		...(Array.isArray(request.unscheduled_plans)
			? { unscheduled_plans: plansToApi(request.unscheduled_plans) }
			: {}),
	});
};

test(`${chalk.yellowBright("billing.generate schedule: generated edit previews, executes, and persists")}`, async () => {
	const customerId = "generate-schedule-e2e-customer";
	const analyticsId = "generate-analytics-addon";
	const supportId = "generate-support-addon";
	const successId = "generate-success-addon";
	const addOn = (id: string, price: number) =>
		products.base({
			id,
			isAddOn: true,
			items: [items.monthlyPrice({ price }), items.monthlyWords()],
		});
	const { autumnV1, autumnV2_2, autumnV2_3, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({
				list: [
					addOn(analyticsId, 200),
					addOn(supportId, 300),
					addOn(successId, 100),
				],
				prefix: "",
			}),
		],
		actions: [],
	});
	await resetCatalogPlans({ ctx, planIds: [planId] });

	for (const [index, amount] of [10, 20, 30].entries()) {
		await autumnV2_3.catalogV2.update({
			plans: [
				{
					plan_id: planId,
					...(index > 0
						? { active: true, versioning: "new_version" as const }
						: { name: "Schedule Version Plan" }),
					price: { amount, interval: BillingInterval.Month },
					items: [messagesItem((index + 1) * 100)],
				},
			],
		});
	}

	const startsAt = [0, 365, 730, 1_095].map(
		(days) => Date.now() + ms.days(days),
	);
	const phaseTerms = [
		{ analytics: 175, core: 900, messages: 12_000, support: 225, version: 1 },
		{ analytics: 190, core: 1_100, messages: 20_000, support: 250, version: 2 },
		{ analytics: 200, core: 1_350, messages: 30_000, support: 275, version: 3 },
		{ analytics: 225, core: 1_500, messages: 40_000, support: 300, version: 3 },
	];
	const pricedPlan = (plan_id: string, amount: number) => ({
		plan_id,
		customize: { price: { amount, interval: BillingInterval.Month } },
	});
	const initialRequest = CreateScheduleParamsV0Schema.parse({
		billing_behavior: "none",
		billing_cycle_anchor: "now",
		customer_id: customerId,
		phases: phaseTerms.map((terms, index) => ({
			...(index % 2 ? { billing_cycle_anchor: "phase_start" as const } : {}),
			plans: [
				{
					...pricedPlan(planId, terms.core),
					customize: {
						items: [itemsV2.monthlyMessages({ included: terms.messages })],
						price: { amount: terms.core, interval: BillingInterval.Month },
					},
					version: terms.version,
				},
				pricedPlan(analyticsId, terms.analytics),
				pricedPlan(supportId, terms.support),
			],
			starts_at: startsAt[index],
		})),
		unscheduled_plans: [pricedPlan(successId, 95)],
	});
	const initial = await autumnV1.billing.createSchedule(initialRequest);
	const { context } = await setupGenerationContext({ ctx, customerId });
	const [persistedSchedule] = context.customer.schedules ?? [];
	expect(
		persistedSchedule?.phases.map(
			({ customer_product_ids }) => customer_product_ids.length,
		),
	).toEqual([3, 3, 3, 3]);
	const knownCustomerProductIds = new Set(
		context.customer.current_plans.map(
			({ customer_product_id }) => customer_product_id,
		),
	);
	expect(
		persistedSchedule?.phases
			.flatMap(({ customer_product_ids }) => customer_product_ids)
			.every((id) => knownCustomerProductIds.has(id)),
	).toBe(true);
	expect(
		persistedSchedule?.phases.map(
			({ billing_cycle_anchor }) => billing_cycle_anchor,
		),
	).toEqual([undefined, "phase_start", undefined, "phase_start"]);
	const generated = await autumnV2_2.post(GENERATE_PATH, {
		customer_id: customerId,
		current_request: initialRequest,
		prompt:
			"In phase 3 only, change the Support Add-on price from $275 to $325 per month. Preserve every phase, plan, date, billing anchor, version, item customization, and the unscheduled Success Add-on exactly.",
		tool: "create_schedule",
	});

	const expectedPrices = phaseTerms.map((terms, index) => [
		terms.core,
		terms.analytics,
		index === 2 ? 325 : terms.support,
	]);
	const generatedPhases = generated.request.phases as {
		billing_cycle_anchor?: string;
		plans: {
			items: { included_usage?: number; price?: number }[];
			plan_id: string;
			version?: number;
		}[];
		starts_at: number;
	}[];
	expect(generatedPhases.map(({ starts_at }) => starts_at)).toEqual(startsAt);
	expect(
		generatedPhases.map(({ plans }) => plans.map(({ plan_id }) => plan_id)),
	).toEqual(phaseTerms.map(() => [planId, analyticsId, supportId]));
	expect(generatedPhases.map(({ plans }) => plans[0]?.version)).toEqual(
		phaseTerms.map(({ version }) => version),
	);
	expect(
		generatedPhases.map(({ billing_cycle_anchor }) => billing_cycle_anchor),
	).toEqual([undefined, "phase_start", undefined, "phase_start"]);
	expect(
		generatedPhases.map(({ plans }) =>
			plans.map(
				({ items: planItems }) => planItems.find(({ price }) => price)?.price,
			),
		),
	).toEqual(expectedPrices);
	expect(
		generatedPhases.map(
			({ plans }) =>
				plans[0]?.items.find(({ included_usage }) => included_usage)
					?.included_usage,
		),
	).toEqual(phaseTerms.map(({ messages }) => messages));
	expect(generated.request.unscheduled_plans).toMatchObject([
		{
			plan_id: successId,
			items: expect.arrayContaining([expect.objectContaining({ price: 95 })]),
		},
	]);
	const request = generatedRequestToApi({ ctx, request: generated.request });

	await autumnV1.post("/billing.preview_create_schedule", request);
	const applied = await autumnV1.billing.createSchedule(request);

	getRequiredScheduleId(initial.schedule_id);
	const appliedScheduleId = getRequiredScheduleId(applied.schedule_id);
	expect(
		applied.phases.map(
			({ customer_product_ids }) => customer_product_ids.length,
		),
	).toEqual([3, 3, 3, 3]);
	const appliedPrices = await Promise.all(
		applied.phases.map(
			async ({ customer_product_ids }) =>
				await Promise.all(
					customer_product_ids.map(
						async (customerProductId) =>
							(
								await getCustomerProductPriceAmounts({ ctx, customerProductId })
							)[0],
					),
				),
		),
	);
	expect(appliedPrices).toEqual(expectedPrices);
	const appliedVersions = await Promise.all(
		applied.phases.map(
			async ({ customer_product_ids }) =>
				(
					await CusProductService.getFull({
						db: ctx.db,
						id: customer_product_ids[0]!,
					})
				)?.product.version,
		),
	);
	expect(appliedVersions).toEqual(phaseTerms.map(({ version }) => version));
	const coreEntitlements = await Promise.all(
		applied.phases.map(
			async ({ customer_product_ids }) =>
				await getCustomerProductEntitlementBalances({
					ctx,
					customerProductId: customer_product_ids[0]!,
				}),
		),
	);
	expect(
		coreEntitlements.map(
			(entitlements) =>
				entitlements.find(({ feature_id }) => feature_id === "messages")
					?.balance,
		),
	).toEqual(phaseTerms.map(({ messages }) => messages));

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		withEntities: true,
	});
	const hydrated = await hydrateCustomerWithSchedules({ ctx, fullCustomer });
	expect(hydrated.schedule?.id).toBe(appliedScheduleId);
	expect(hydrated.schedule?.phases).toHaveLength(4);
}, 120_000);

test(`${chalk.yellowBright("billing.generate schedule: loads complete legacy entity context")}`, async () => {
	const customerId = "generate-schedule-entity-context-customer";
	const plans = Array.from({ length: 6 }, (_, index) =>
		products.base({
			id: `generate-schedule-entity-context-plan-${index}`,
			isAddOn: index > 0,
			items: [items.monthlyPrice({ price: 20 + index })],
		}),
	);
	const { autumnV1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: plans, prefix: "" }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [],
	});
	const entityId = entities[0]!.id;
	const response = await autumnV1.billing.createSchedule({
		customer_id: customerId,
		entity_id: entityId,
		phases: [
			{
				plans: plans.map(({ id }) => ({ plan_id: id })),
				starts_at: Date.now(),
			},
			{
				plans: plans.map(({ id }) => ({ plan_id: id })),
				starts_at: Date.now() + ms.days(30),
			},
		],
	});

	await ctx.db
		.update(schedules)
		.set({ entity_id: null, internal_entity_id: null })
		.where(eq(schedules.id, getRequiredScheduleId(response.schedule_id)));

	const { context } = await setupGenerationContext({ ctx, customerId });
	expect(context.customer.schedules).toMatchObject([{ entity_id: entityId }]);
	const currentPlanIds = new Set(
		context.customer.current_plans.map(
			({ customer_product_id }) => customer_product_id,
		),
	);
	expect(
		response.phases
			.flatMap(({ customer_product_ids }) => customer_product_ids)
			.every((id) => currentPlanIds.has(id)),
	).toBe(true);
}, 120_000);

test(`${chalk.yellowBright("billing.generate schedule: appends a relative phase and preserves an unscheduled plan")}`, async () => {
	const customerId = "generate-schedule-relative-customer";
	const group = "generate-schedule-relative-group";
	const plan = (id: string, price: number) =>
		products.base({
			id,
			group,
			items: [items.monthlyPrice({ price })],
		});
	const catalog = [
		plan("starter", 20),
		plan("growth", 50),
		plan("scale", 100),
		products.base({
			id: "support-addon",
			isAddOn: true,
			items: [items.monthlyPrice({ price: 10 })],
		}),
	];
	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: catalog, prefix: "" }),
		],
		actions: [],
	});
	const now = Date.now();
	const initialRequest = CreateScheduleParamsV0Schema.parse({
		customer_id: customerId,
		phases: [
			{ starts_at: now, plans: [{ plan_id: "starter" }] },
			{ starts_at: now + ms.days(30), plans: [{ plan_id: "growth" }] },
			{ starts_at: now + ms.days(60), plans: [{ plan_id: "scale" }] },
		],
		unscheduled_plans: [{ plan_id: "support-addon" }],
	});
	await autumnV1.billing.createSchedule(initialRequest);

	const generated = await autumnV2_2.post(GENERATE_PATH, {
		customer_id: customerId,
		current_request: initialRequest,
		prompt:
			"Keep phases 1 through 3 and the unscheduled Support Add-on exactly unchanged. Append phase 4 two months after phase 3 with the Growth plan at a custom $75 per month.",
		tool: "create_schedule",
	});

	expect(generated.request.phases).toHaveLength(4);
	expect(generated.request.phases.slice(0, 3)).toMatchObject(
		initialRequest.phases,
	);
	expect(generated.request.phases[3]).toMatchObject({
		plans: [{ plan_id: "growth" }],
		starting_after: { duration_count: 2, duration_type: "month" },
	});
	expect(generated.request.unscheduled_plans).toMatchObject([
		{ plan_id: "support-addon" },
	]);
	const phaseFourItems = generated.request.phases[3]?.plans[0]?.items as {
		price?: number;
	}[];
	expect(phaseFourItems.some((item) => item.price === 75)).toBe(true);

	const request = generatedRequestToApi({ ctx, request: generated.request });
	await autumnV1.post("/billing.preview_create_schedule", request);
	const applied = await autumnV1.billing.createSchedule(request);
	expect(applied.phases).toHaveLength(4);
	expect(applied.phases[3]!.starts_at).toBeGreaterThan(
		applied.phases[2]!.starts_at,
	);
}, 120_000);
