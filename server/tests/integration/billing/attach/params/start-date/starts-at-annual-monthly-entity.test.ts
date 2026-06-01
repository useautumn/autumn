import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiEntityV2,
	type AttachParamsV1Input,
	type AttachPreviewResponse,
	ms,
} from "@autumn/shared";
import {
	ANNUAL_MONTHLY_MESSAGES_PHASES,
	annualMonthlyMessagesPlan,
	countMonthlyPeriods,
	expectAnnualMonthlyPreviewCorrect,
	expectAnnualMonthlyStripeInvoiceCorrect,
	expectedAnnualMonthlyImmediateTotal,
	monthlyPeriodsFrom,
	prepaidMessagesAmount,
} from "@tests/integration/billing/utils/annualMonthlyMessagesTestUtils";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";
import { Decimal } from "decimal.js";
import { expectAttachBackdateCorrect } from "./utils/expectAttachBackdateCorrect";

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

const attachParams = ({
	customerId,
	entityId,
	planId,
	startsAt,
}: {
	customerId: string;
	entityId: string;
	planId: string;
	startsAt?: number;
}): AttachParamsV1Input => {
	const firstPhase = ANNUAL_MONTHLY_MESSAGES_PHASES[0]!;

	return {
		customer_id: customerId,
		entity_id: entityId,
		plan_id: planId,
		starts_at: startsAt,
		redirect_mode: "if_required",
		customize: {
			price: itemsV2.annualPrice({ amount: firstPhase.annualAmount }),
		},
		feature_quantities: [
			{
				feature_id: TestFeature.Messages,
				quantity: firstPhase.prepaidQuantity,
			},
		],
	};
};

test.concurrent(
	`${chalk.yellowBright("attach annual monthly entity backdate: preview and Stripe invoice match elapsed cycles")}`,
	async () => {
		const customerId = "attach-annual-monthly-entity-backdate";
		const plan = annualMonthlyMessagesPlan();

		const { autumnV1, autumnV2_2, ctx, entities, advancedTo } =
			await initScenario({
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
		const params = attachParams({
			customerId,
			entityId,
			planId: plan.id,
			startsAt,
		});

		const preview =
			(await autumnV2_2.billing.previewAttach<AttachParamsV1Input>(
				params,
			)) as AttachPreviewResponse;
		expectAnnualMonthlyPreviewCorrect({
			preview,
			annualAmount: firstPhase.annualAmount,
			prepaidQuantity: firstPhase.prepaidQuantity,
			startsAt,
			currentEpochMs: advancedTo,
		});

		const result = await autumnV2_2.billing.attach<AttachParamsV1Input>(params);
		expect(result.invoice?.total).toBe(preview.total);

		const cycleCount = countMonthlyPeriods({
			startsAt,
			currentEpochMs: advancedTo,
		});
		await expectAttachBackdateCorrect({
			autumn: autumnV1,
			ctx,
			customerId,
			productId: plan.id,
			startsAt,
			result,
			minInvoiceTotal:
				expectedAnnualMonthlyImmediateTotal({
					annualAmount: firstPhase.annualAmount,
					prepaidQuantity: firstPhase.prepaidQuantity,
					startsAt,
					currentEpochMs: advancedTo,
				}) *
					100 -
				1,
			minInvoiceLineCount: cycleCount + 1,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const invoice = await latestStripeInvoice({ ctx, customer });
		expectAnnualMonthlyStripeInvoiceCorrect({
			invoice,
			annualAmount: firstPhase.annualAmount,
			monthlyAmount: prepaidMessagesAmount({
				quantity: firstPhase.prepaidQuantity,
			}),
			monthlyPeriods: monthlyPeriodsFrom({ startsAt, count: cycleCount }),
			expectedTotal: preview.total,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("attach annual monthly multi entity: second entity remains exact after first renewal")}`,
	async () => {
		const customerId = "attach-annual-monthly-multi-entity";
		const plan = annualMonthlyMessagesPlan();

		const {
			autumnV1,
			autumnV2_2,
			ctx,
			entities,
			testClockId,
			advancedTo,
		} = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [],
		});

		const firstPhase = ANNUAL_MONTHLY_MESSAGES_PHASES[0]!;
		const entity0Params = attachParams({
			customerId,
			entityId: entities[0]!.id,
			planId: plan.id,
		});

		const entity0Result =
			await autumnV2_2.billing.attach<AttachParamsV1Input>(entity0Params);
		expect(entity0Result.invoice?.total).toBe(
			firstPhase.annualAmount +
				prepaidMessagesAmount({ quantity: firstPhase.prepaidQuantity }),
		);

		const currentEpochMs = await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			currentEpochMs: advancedTo,
		});
		const customerAfterRenewal =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const prepaidAmount = prepaidMessagesAmount({
			quantity: firstPhase.prepaidQuantity,
		});

		await expectCustomerInvoiceCorrect({
			customer: customerAfterRenewal,
			count: 2,
			latestTotal: prepaidAmount,
		});

		const entity1StartsAt = currentEpochMs;
		const entity1Params = attachParams({
			customerId,
			entityId: entities[1]!.id,
			planId: plan.id,
			startsAt: entity1StartsAt,
		});
		const preview =
			(await autumnV2_2.billing.previewAttach<AttachParamsV1Input>(
				entity1Params,
			)) as AttachPreviewResponse;

		const annualLine = preview.line_items.find((item) => item.feature_id === null);
		const prepaidLine = preview.line_items.find(
			(item) => item.feature_id === TestFeature.Messages,
		);
		expect(annualLine).toBeDefined();
		expect(prepaidLine).toBeDefined();
		expect(annualLine!.total).toBeLessThan(firstPhase.annualAmount);
		expect(prepaidLine!.total).toBeLessThan(prepaidAmount);
		const annualLineTotal = new Decimal(annualLine!.total)
			.toDecimalPlaces(2)
			.toNumber();
		const prepaidLineTotal = new Decimal(prepaidLine!.total)
			.toDecimalPlaces(2)
			.toNumber();

		const expectedEntity1Total = new Decimal(annualLineTotal)
			.plus(prepaidLineTotal)
			.toDecimalPlaces(2)
			.toNumber();
		expect(preview.subtotal).toBe(expectedEntity1Total);
		expect(preview.total).toBe(preview.subtotal);
		expectPreviewNextCycleCorrect({
			preview,
			startsAt: addMonths(advancedTo, 2).getTime(),
			total: prepaidAmount * 2,
		});

		const entity1Result =
			await autumnV2_2.billing.attach<AttachParamsV1Input>(entity1Params);
		expect(entity1Result.invoice?.total).toBe(preview.total);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const invoice = await latestStripeInvoice({ ctx, customer });
		expectAnnualMonthlyStripeInvoiceCorrect({
			invoice,
			annualAmount: annualLineTotal,
			monthlyAmount: prepaidLineTotal,
			monthlyPeriods: [
				{
					start: entity1StartsAt,
					end: addMonths(advancedTo, 2).getTime(),
				},
			],
			expectedTotal: preview.total,
		});

		const entity1 = await autumnV2_2.entities.get<ApiEntityV2>(
			customerId,
			entities[1]!.id,
		);
		expectBalanceCorrect({
			customer: entity1,
			featureId: TestFeature.Messages,
			remaining: firstPhase.prepaidQuantity,
			usage: 0,
			nextResetAt: addMonths(entity1StartsAt, 1).getTime(),
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);
