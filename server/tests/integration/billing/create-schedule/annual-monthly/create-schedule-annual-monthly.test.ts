import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiEntityV2,
	type AttachPreviewResponse,
	type CreateScheduleParamsV0Input,
	type CreateScheduleResponse,
	CusProductStatus,
	customerProducts,
	ms,
} from "@autumn/shared";
import {
	ANNUAL_MONTHLY_MESSAGES_PHASES,
	annualMonthlyMessagesPlan,
	annualMonthlyPhasePlan,
	countMonthlyPeriods,
	expectAnnualMonthlyPreviewCorrect,
	expectAnnualMonthlyStripeInvoiceCorrect,
	expectedAnnualMonthlyImmediateTotal,
	monthlyPeriodsFrom,
	nextMonthlyBoundary,
	prepaidMessagesAmount,
} from "@tests/integration/billing/utils/annualMonthlyMessagesTestUtils";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { hoursToFinalizeInvoice } from "@tests/utils/constants";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addHours, addMonths } from "date-fns";
import { inArray } from "drizzle-orm";
import { expectBackdatedStripeSubscriptionCorrect } from "../../utils/expectBackdatedStripeSubscriptionCorrect";
import {
	expectResetAnchoredTo,
	getCustomerProduct,
} from "../../attach/params/start-date/utils";

const previewCreateSchedule = async ({
	autumnV1,
	params,
}: {
	autumnV1: Awaited<ReturnType<typeof initScenario>>["autumnV1"];
	params: CreateScheduleParamsV0Input;
}): Promise<AttachPreviewResponse> =>
	await autumnV1.post("/billing.preview_create_schedule", params);

const threePhaseParams = ({
	customerId,
	entityId,
	planId,
	startsAt,
}: {
	customerId: string;
	entityId: string;
	planId: string;
	startsAt: number;
}): CreateScheduleParamsV0Input => {
	const phases = ANNUAL_MONTHLY_MESSAGES_PHASES.map((phase, index) => ({
		starts_at: addMonths(startsAt, index * 4).getTime(),
		plans: [
			annualMonthlyPhasePlan({
				planId,
				annualAmount: phase.annualAmount,
				prepaidQuantity: phase.prepaidQuantity,
			}),
		],
	}));

	return {
		customer_id: customerId,
		entity_id: entityId,
		phases: phases as CreateScheduleParamsV0Input["phases"],
	};
};

const latestStripeInvoice = async ({
	ctx,
	customer,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	customer: ApiCustomerV3;
}) => {
	const stripeId = customer.invoices?.[0]?.stripe_id;
	if (!stripeId) throw new Error("Expected latest invoice to have stripe_id");

	return await ctx.stripeCli.invoices.retrieve(stripeId, {
		expand: ["lines.data.price"],
	});
};

const expectThreePhaseBackdatedRowsCorrect = async ({
	ctx,
	response,
	planId,
	entityId,
	startsAt,
	phase2StartsAt,
	phase3StartsAt,
	cycleCount,
	expectedInvoiceTotal,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	response: CreateScheduleResponse;
	planId: string;
	entityId: string;
	startsAt: number;
	phase2StartsAt: number;
	phase3StartsAt: number;
	cycleCount: number;
	expectedInvoiceTotal: number;
}) => {
	const expectTimestamp = (actual: number | null | undefined, expected: number) => {
		expect(actual).toBeDefined();
		expect(Math.abs(actual! - expected)).toBeLessThan(ms.seconds(2));
	};

	expect(response.status).toBe("created");
	expect(response.invoice?.stripe_id).toBeDefined();
	expect(response.invoice?.total).toBe(expectedInvoiceTotal);
	expect(response.phases).toHaveLength(3);
	expect(response.phases.map((phase) => phase.starts_at)).toEqual([
		startsAt,
		phase2StartsAt,
		phase3StartsAt,
	]);

	const customerProductIds = response.phases.flatMap(
		(phase) => phase.customer_product_ids,
	);
	const rows = await ctx.db
		.select()
		.from(customerProducts)
		.where(inArray(customerProducts.id, customerProductIds));
	const rowById = new Map(rows.map((row) => [row.id, row]));
	const immediate = rowById.get(response.phases[0]!.customer_product_ids[0]!);
	const phase2 = rowById.get(response.phases[1]!.customer_product_ids[0]!);
	const phase3 = rowById.get(response.phases[2]!.customer_product_ids[0]!);

	expect(immediate).toMatchObject({
		product_id: planId,
		entity_id: entityId,
		status: CusProductStatus.Active,
		starts_at: startsAt,
	});
	expect(phase2).toMatchObject({
		product_id: planId,
		entity_id: entityId,
		status: CusProductStatus.Scheduled,
	});
	expectTimestamp(phase2?.starts_at, phase2StartsAt);
	expect(phase3).toMatchObject({
		product_id: planId,
		entity_id: entityId,
		status: CusProductStatus.Scheduled,
	});
	expectTimestamp(phase3?.starts_at, phase3StartsAt);

	await expectBackdatedStripeSubscriptionCorrect({
		ctx,
		stripeSubscriptionId: immediate!.subscription_ids![0]!,
		startsAt,
		stripeInvoiceId: response.invoice!.stripe_id,
		minInvoiceTotal: expectedInvoiceTotal * 100 - 1,
		minInvoiceLineCount: cycleCount + 1,
		expandSchedule: true,
	});
};

test.concurrent(
	`${chalk.yellowBright("create-schedule annual monthly: three-phase entity preview matches executed invoice")}`,
	async () => {
		const customerId = "create-schedule-annual-monthly-preview";
		const plan = annualMonthlyMessagesPlan();

		const { autumnV1, ctx, entities, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [],
		});

		const entityId = entities[0]!.id;
		const startsAt = advancedTo;
		const firstPhase = ANNUAL_MONTHLY_MESSAGES_PHASES[0]!;
		const params = threePhaseParams({
			customerId,
			entityId,
			planId: plan.id,
			startsAt,
		});

		const preview = await previewCreateSchedule({ autumnV1, params });
		expectAnnualMonthlyPreviewCorrect({
			preview,
			annualAmount: firstPhase.annualAmount,
			prepaidQuantity: firstPhase.prepaidQuantity,
			startsAt,
			currentEpochMs: advancedTo,
		});

		const response = await autumnV1.billing.createSchedule(params);
		expect(response.status).toBe("created");
		expect(response.invoice?.total).toBe(preview.total);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const invoice = await latestStripeInvoice({ ctx, customer });
		const monthlyAmount = prepaidMessagesAmount({
			quantity: firstPhase.prepaidQuantity,
		});

		expectAnnualMonthlyStripeInvoiceCorrect({
			invoice,
			annualAmount: firstPhase.annualAmount,
			monthlyAmount,
			monthlyPeriods: monthlyPeriodsFrom({ startsAt, count: 1 }),
			expectedTotal: firstPhase.annualAmount + monthlyAmount,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });

		const cusProduct = await getCustomerProduct({
			ctx,
			customerId,
			productId: plan.id,
		});
		expectResetAnchoredTo({
			cusProduct,
			featureId: TestFeature.Messages,
			startDate: startsAt,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule annual monthly backdate: preview aggregates monthly cycles and renewal is next chronological event")}`,
	async () => {
		const customerId = "create-schedule-annual-monthly-backdate";
		const plan = annualMonthlyMessagesPlan();

		const { autumnV1, ctx, entities, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [],
		});

		const entityId = entities[0]!.id;
		const startsAt = advancedTo - ms.days(40);
		const firstPhase = ANNUAL_MONTHLY_MESSAGES_PHASES[0]!;
		const params = threePhaseParams({
			customerId,
			entityId,
			planId: plan.id,
			startsAt,
		});

		const preview = await previewCreateSchedule({ autumnV1, params });
		expectAnnualMonthlyPreviewCorrect({
			preview,
			annualAmount: firstPhase.annualAmount,
			prepaidQuantity: firstPhase.prepaidQuantity,
			startsAt,
			currentEpochMs: advancedTo,
		});

		const response = await autumnV1.billing.createSchedule(params);
		const cycleCount = countMonthlyPeriods({
			startsAt,
			currentEpochMs: advancedTo,
		});
		const monthlyAmount = prepaidMessagesAmount({
			quantity: firstPhase.prepaidQuantity,
		});

		await expectThreePhaseBackdatedRowsCorrect({
			ctx,
			response,
			planId: plan.id,
			entityId,
			startsAt,
			phase2StartsAt: addMonths(startsAt, 4).getTime(),
			phase3StartsAt: addMonths(startsAt, 8).getTime(),
			cycleCount,
			expectedInvoiceTotal: preview.total,
		});
		expect(response.invoice?.total).toBe(preview.total);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const invoice = await latestStripeInvoice({ ctx, customer });
		expectAnnualMonthlyStripeInvoiceCorrect({
			invoice,
			annualAmount: firstPhase.annualAmount,
			monthlyAmount,
			monthlyPeriods: monthlyPeriodsFrom({ startsAt, count: cycleCount }),
			expectedTotal: expectedAnnualMonthlyImmediateTotal({
				annualAmount: firstPhase.annualAmount,
				prepaidQuantity: firstPhase.prepaidQuantity,
				startsAt,
				currentEpochMs: advancedTo,
			}),
		});

		const cusProduct = await getCustomerProduct({
			ctx,
			customerId,
			productId: plan.id,
		});
		expectResetAnchoredTo({
			cusProduct,
			featureId: TestFeature.Messages,
			startDate: addMonths(startsAt, cycleCount - 1).getTime(),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule annual monthly backdate: first renewal bills prepaid exactly")}`,
	async () => {
		const customerId = "create-schedule-annual-monthly-backdate-renewal";
		const plan = annualMonthlyMessagesPlan();

		const {
			autumnV1,
			autumnV2_1,
			ctx,
			entities,
			testClockId,
			advancedTo,
		} = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [],
		});

		const entityId = entities[0]!.id;
		const startsAt = advancedTo - ms.days(40);
		const firstPhase = ANNUAL_MONTHLY_MESSAGES_PHASES[0]!;
		const params = threePhaseParams({
			customerId,
			entityId,
			planId: plan.id,
			startsAt,
		});

		await autumnV1.billing.createSchedule(params);

		const nextCycleStart = nextMonthlyBoundary({
			startsAt,
			currentEpochMs: advancedTo,
		});
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advanceTo: addHours(nextCycleStart, hoursToFinalizeInvoice).getTime(),
			waitForSeconds: 30,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const prepaidAmount = prepaidMessagesAmount({
			quantity: firstPhase.prepaidQuantity,
		});
		await expectCustomerInvoiceCorrect({
			customer,
			count: 2,
			latestTotal: prepaidAmount,
		});

		const invoice = await latestStripeInvoice({ ctx, customer });
		expectAnnualMonthlyStripeInvoiceCorrect({
			invoice,
			monthlyAmount: prepaidAmount,
			monthlyPeriods: monthlyPeriodsFrom({ startsAt: nextCycleStart, count: 1 }),
			expectedTotal: prepaidAmount,
		});

		const entity = await autumnV2_1.entities.get<ApiEntityV2>(
			customerId,
			entityId,
		);
		expectBalanceCorrect({
			customer: entity,
			featureId: TestFeature.Messages,
			remaining: firstPhase.prepaidQuantity,
			usage: 0,
			nextResetAt: addMonths(nextCycleStart, 1).getTime(),
		});
	},
);
