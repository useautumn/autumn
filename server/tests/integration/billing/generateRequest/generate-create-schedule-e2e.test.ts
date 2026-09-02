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
} from "@autumn/shared";
import {
	getCustomerProductPriceAmounts,
	getRequiredScheduleId,
} from "@tests/integration/billing/create-schedule/utils/createScheduleTestHelpers.js";
import { messagesItem } from "@tests/integration/catalog-v2/plans/licenses/utils/seedLicensePlans.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { productItemsToCustomizePlanV1 } from "@utils/productV2Utils/productItemUtils/convertProductItem/productItemsToCustomizePlanV1.js";
import chalk from "chalk";
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
	const { autumnV1, autumnV2_2, autumnV2_3, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ paymentMethod: "success", testClock: false })],
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

	const now = Date.now();
	const startsAt = [now, now + ms.days(30), now + ms.days(60)];
	const initialRequest = CreateScheduleParamsV0Schema.parse({
		customer_id: customerId,
		phases: [
			{ starts_at: startsAt[0], plans: [{ plan_id: planId, version: 2 }] },
			{
				starts_at: startsAt[1],
				plans: [
					{
						plan_id: planId,
						version: 2,
						customize: {
							price: { amount: 25, interval: BillingInterval.Month },
						},
					},
				],
			},
			{ starts_at: startsAt[2], plans: [{ plan_id: planId, version: 3 }] },
		],
	});
	const initial = await autumnV1.billing.createSchedule(initialRequest);
	const generated = await autumnV2_2.post(GENERATE_PATH, {
		customer_id: customerId,
		current_request: initialRequest,
		prompt:
			"Move only phase 2 to version 3 but keep its $25 monthly price. Leave phases 1 and 3 unchanged.",
		tool: "create_schedule",
	});

	expect(
		generated.request.phases.map(
			(phase: { starts_at: number }) => phase.starts_at,
		),
	).toEqual(startsAt);
	expect(
		generated.request.phases.map(
			(phase: { plans: { version: number }[] }) => phase.plans[0]?.version,
		),
	).toEqual([2, 3, 3]);
	const phaseTwoItems = generated.request.phases[1]?.plans[0]?.items as {
		price?: number;
	}[];
	expect(phaseTwoItems.some((item) => item.price === 25)).toBe(true);
	const request = generatedRequestToApi({ ctx, request: generated.request });
	expect(request.phases[1]?.plans[0]?.customize?.price?.amount).toBe(25);

	const preview = await autumnV1.post(
		"/billing.preview_create_schedule",
		request,
	);
	expect(preview.next_cycle?.subtotal).toBe(25);
	const applied = await autumnV1.billing.createSchedule(request);

	getRequiredScheduleId(initial.schedule_id);
	const appliedScheduleId = getRequiredScheduleId(applied.schedule_id);
	expect(applied.phases).toHaveLength(3);
	const phaseTwoCustomerProductId = applied.phases[1]?.customer_product_ids[0];
	if (!phaseTwoCustomerProductId)
		throw new Error("Expected phase 2 customer product");
	const phaseTwoProduct = await CusProductService.getFull({
		db: ctx.db,
		id: phaseTwoCustomerProductId,
	});
	expect(phaseTwoProduct?.product.version).toBe(3);
	const phaseTwoPrices = await getCustomerProductPriceAmounts({
		ctx,
		customerProductId: phaseTwoCustomerProductId,
	});
	expect(phaseTwoPrices).toEqual([25]);

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		withEntities: true,
	});
	const hydrated = await hydrateCustomerWithSchedules({ ctx, fullCustomer });
	expect(hydrated.schedule?.id).toBe(appliedScheduleId);
	expect(hydrated.schedule?.phases).toHaveLength(3);
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
