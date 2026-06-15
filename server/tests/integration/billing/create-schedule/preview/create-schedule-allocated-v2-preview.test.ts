import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	ApiCustomerV5,
	AttachParamsV1Input,
	AttachPreviewResponse,
	CreateScheduleParamsV0Input,
} from "@autumn/shared";
import { expectInvoiceLineItemsCorrect } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// Contract: createSchedule preview does not bill allocated-v2 usage immediately.
// After the scheduled phase activates, usage carries into the next allocated-v2 plan.

const previewCreateSchedule = async ({
	autumnV2_3,
	params,
}: {
	autumnV2_3: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	params: CreateScheduleParamsV0Input;
}): Promise<AttachPreviewResponse> =>
	await autumnV2_3.post("/billing.preview_create_schedule", params);

const getActivePeriodEnd = ({ customer, planId }: { customer: ApiCustomerV5; planId: string }) => {
	const transitionAt = customer.subscriptions.find(
		(subscription) => subscription.plan_id === planId,
	)?.current_period_end;
	expect(transitionAt).toBeDefined();
	return transitionAt!;
};

test.concurrent(
	`${chalk.yellowBright("create-schedule allocated v2 preview: scheduled switch does not bill allocated usage immediately")}`,
	async () => {
		const customerId = "create-schedule-preview-allocated-v2";
		const pro = products.pro({
			id: "pro",
			items: [items.allocatedV2Users({ includedUsage: 2 })],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.allocatedV2Users({ includedUsage: 5 })],
		});

		const { autumnV2_3, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [],
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			redirect_mode: "if_required",
		});
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 5,
		});
		await timeout(2000);
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 1,
			latestTotal: 20,
		});

		const customerAfterTrack =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		const transitionAt = getActivePeriodEnd({
			customer: customerAfterTrack,
			planId: pro.id,
		});

		const params: CreateScheduleParamsV0Input = {
			customer_id: customerId,
			phases: [
				{
					starts_at: advancedTo,
					plans: [{ plan_id: pro.id }],
				},
				{
					starts_at: transitionAt!,
					plans: [{ plan_id: premium.id }],
				},
			],
		};

		const preview = await previewCreateSchedule({ autumnV2_3, params });

		expect(preview.subtotal).toBe(0);
		expect(preview.total).toBe(0);
		expect(preview.line_items).toHaveLength(0);
		expect(preview.next_cycle).toEqual(
			expect.objectContaining({
				starts_at: transitionAt,
				total: 50,
			}),
		);
		expect(preview.next_cycle?.usage_line_items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					plan_id: pro.id,
					feature_id: TestFeature.Users,
				}),
			]),
		);

		const response = await autumnV2_3.billing.createSchedule(params);
		expect(response.status).toBe("created");
		expect(response.invoice).toBeUndefined();
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 1,
			latestTotal: 20,
		});

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({
			customer,
			active: [pro.id],
			scheduled: [premium.id],
		});
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Users,
			remaining: 0,
			usage: 5,
			planId: pro.id,
			nextResetAt: null,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule allocated v2: scheduled phase carries usage to next plan")}`,
	async () => {
		const customerId = "create-schedule-allocated-v2-carryover";
		const pro = products.pro({
			id: "pro",
			items: [items.allocatedV2Users({ includedUsage: 2 })],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.allocatedV2Users({ includedUsage: 5 })],
		});

		const { autumnV1, autumnV2_3, ctx, testClockId, advancedTo } =
			await initScenario({
				customerId,
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro, premium] }),
				],
				actions: [],
			});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			redirect_mode: "if_required",
		});
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 5,
		});
		await timeout(2000);

		const customerAfterTrack =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		const transitionAt = getActivePeriodEnd({
			customer: customerAfterTrack,
			planId: pro.id,
		});

		const params: CreateScheduleParamsV0Input = {
			customer_id: customerId,
			phases: [
				{
					starts_at: advancedTo,
					plans: [{ plan_id: pro.id }],
				},
				{
					starts_at: transitionAt,
					plans: [{ plan_id: premium.id }],
				},
			],
		};

		const preview = await previewCreateSchedule({ autumnV2_3, params });
		expect(preview.total).toBe(0);
		await autumnV2_3.billing.createSchedule(params);
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 1,
			latestTotal: 20,
		});

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			withPause: true,
		});

		const customerAfterPhase =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({
			customer: customerAfterPhase,
			active: [premium.id],
			notPresent: [pro.id],
		});
		expectBalanceCorrect({
			customer: customerAfterPhase,
			featureId: TestFeature.Users,
			remaining: 0,
			usage: 5,
			planId: premium.id,
			nextResetAt: null,
		});

		const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerV3,
			count: 2,
			latestTotal: 80,
			latestInvoiceProductIds: [pro.id, premium.id],
		});
		await expectInvoiceLineItemsCorrect({
			stripeInvoiceId: customerV3.invoices![0].stripe_id,
			expectedTotal: 80,
			expectedLineItems: [
				{
					featureId: TestFeature.Users,
					productId: pro.id,
					totalAmount: 30,
					billingTiming: "in_arrear",
					direction: "charge",
				},
				{
					isBasePrice: true,
					totalAmount: 50,
					direction: "charge",
				},
			],
		});
	},
);
