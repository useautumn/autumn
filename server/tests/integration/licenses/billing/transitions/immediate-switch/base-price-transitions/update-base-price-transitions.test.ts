import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { customerEntitlements } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { setupLicenseUpdateScenario } from "@tests/integration/licenses/billing/update/setupLicenseUpdateScenario";
import { expectLicenseUpdatePreviewCorrect } from "@tests/integration/licenses/utils/expectLicenseBillingPreviewCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import chalk from "chalk";
import { inArray } from "drizzle-orm";
import {
	expectAssignmentBasePrices,
	licensePricePatch,
} from "../../utils/basePriceTransitionTestUtils";

const SEAT_COUNT = 2;
const OLD_PRICE = 20;
const NEW_PRICE = 40;

test.concurrent(
	`${chalk.yellowBright("base price transition: update replaces the same license")}`,
	async () => {
		const customerId = "bp-update-replace";
		const scenario = await setupLicenseUpdateScenario({
			customerId,
			idPrefix: "bp-replace",
			seatPrice: OLD_PRICE,
			seatItems: [items.monthlyMessages({ includedUsage: 100 })],
			includedSeats: 0,
			attachedSeats: SEAT_COUNT,
		});
		await scenario.assignSeats({ count: SEAT_COUNT });

		const params: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: scenario.parent.id,
			customize: {
				upsert_licenses: licensePricePatch({
					licensePlanId: scenario.devSeat.id,
					amount: NEW_PRICE,
				}),
			},
		};
		const preview =
			await scenario.autumnV2_3.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				params,
			);
		await expectLicenseUpdatePreviewCorrect({
			preview,
			customerId,
			advancedTo: scenario.advancedTo,
			oldRecurringTotal: SEAT_COUNT * OLD_PRICE,
			newRecurringTotal: SEAT_COUNT * NEW_PRICE,
		});
		await scenario.autumnV2_3.billing.update(params);

		await expectAssignmentBasePrices({
			ctx: scenario.ctx,
			autumn: scenario.autumnV2_3,
			customerId,
			licensePlanId: scenario.devSeat.id,
			amount: NEW_PRICE,
			count: SEAT_COUNT,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: preview.total,
		});
		await expectStripeSubscriptionCorrect({
			ctx: scenario.ctx,
			customerId,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("base price transition: update removes the only paid item")}`,
	async () => {
		const customerId = "bp-update-remove";
		const scenario = await setupLicenseUpdateScenario({
			customerId,
			idPrefix: "bp-remove",
			seatPrice: OLD_PRICE,
			seatItems: [items.monthlyMessages({ includedUsage: 100 })],
			includedSeats: 0,
			attachedSeats: SEAT_COUNT,
		});
		await scenario.assignSeats({ count: SEAT_COUNT });

		const params: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: scenario.parent.id,
			customize: {
				upsert_licenses: licensePricePatch({
					licensePlanId: scenario.devSeat.id,
					amount: null,
				}),
			},
		};
		const preview =
			await scenario.autumnV2_3.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				params,
			);
		expect(preview.total).toBe(-SEAT_COUNT * OLD_PRICE);
		expect(preview.next_cycle).toBeUndefined();
		await scenario.autumnV2_3.billing.update(params);

		await expectAssignmentBasePrices({
			ctx: scenario.ctx,
			autumn: scenario.autumnV2_3,
			customerId,
			licensePlanId: scenario.devSeat.id,
			amount: null,
			count: SEAT_COUNT,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: preview.total,
		});
		const customer =
			await scenario.autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(
			customer.products.find((product) => product.id === scenario.parent.id)
				?.stripe_subscription_ids ?? [],
		).toHaveLength(0);
		const stripeSubscriptions = await scenario.ctx.stripeCli.subscriptions.list(
			{
				customer: customer.stripe_id!,
				status: "all",
			},
		);
		expect(stripeSubscriptions.data).toHaveLength(1);
		expect(stripeSubscriptions.data[0]?.status).toBe("canceled");
	},
);

test.concurrent(
	`${chalk.yellowBright("base price transition: update adds the first paid item")}`,
	async () => {
		const customerId = "bp-update-add";
		const scenario = await setupLicenseUpdateScenario({
			customerId,
			idPrefix: "bp-add",
			seatItems: [items.monthlyMessages({ includedUsage: 100 })],
			includedSeats: 0,
			attachedSeats: SEAT_COUNT,
		});
		await scenario.assignSeats({ count: SEAT_COUNT });

		const params: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: scenario.parent.id,
			customize: {
				upsert_licenses: licensePricePatch({
					licensePlanId: scenario.devSeat.id,
					amount: OLD_PRICE,
				}),
			},
		};
		const preview =
			await scenario.autumnV2_3.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				params,
			);
		expect(preview.total).toBe(SEAT_COUNT * OLD_PRICE);
		expect(preview.next_cycle).toBeUndefined();
		await scenario.autumnV2_3.billing.update(params);

		const assignments = await expectAssignmentBasePrices({
			ctx: scenario.ctx,
			autumn: scenario.autumnV2_3,
			customerId,
			licensePlanId: scenario.devSeat.id,
			amount: OLD_PRICE,
			count: SEAT_COUNT,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 1,
			latestTotal: preview.total,
		});
		await expectStripeSubscriptionCorrect({
			ctx: scenario.ctx,
			customerId,
		});

		const customer =
			await scenario.autumnV1.customers.get<ApiCustomerV3>(customerId);
		const stripeSubscriptions = await scenario.ctx.stripeCli.subscriptions.list(
			{
				customer: customer.stripe_id!,
				status: "active",
			},
		);
		const subscription = stripeSubscriptions.data[0];
		if (!subscription) throw new Error("Expected a Stripe subscription");
		const resetAt = subscription.items.data[0]?.current_period_end;
		if (!resetAt) throw new Error("Expected a Stripe billing period");
		const balances = await scenario.ctx.db
			.select({ nextResetAt: customerEntitlements.next_reset_at })
			.from(customerEntitlements)
			.where(
				inArray(
					customerEntitlements.customer_product_id,
					assignments.map((assignment) => assignment.id),
				),
			);
		expect(balances).toHaveLength(SEAT_COUNT);
		for (const balance of balances) {
			expect(balance.nextResetAt).toBe(resetAt * 1000);
		}
		expect(customer.features[TestFeature.Messages]).toBeUndefined();
	},
);
