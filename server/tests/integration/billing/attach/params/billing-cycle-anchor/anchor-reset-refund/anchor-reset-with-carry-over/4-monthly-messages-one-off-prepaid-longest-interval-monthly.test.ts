import { expect, test } from "bun:test";
import type { ApiCustomerV5, AttachParamsV1Input } from "@autumn/shared";
import { EntInterval } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { calculateAnchorResetNoPartialRefundTotal } from "@tests/integration/billing/utils/proration";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const expectTotalEqual = ({
	actual,
	expected,
	tolerance = 0.01,
}: {
	actual: number;
	expected: number;
	tolerance?: number;
}) => {
	expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
};

test.concurrent(
	`${chalk.yellowBright("anchor-reset-carry-over 4: monthly messages + one-off prepaid (longest interval = monthly)")}`,
	async () => {
		const customerId = "anchor-no-partial-oneoff";
		const proAnnual = products.proAnnual({
			id: "pro-annual",
			items: [
				items.monthlyMessages({ includedUsage: 100 }),
				items.oneOffMessages({
					includedUsage: 0,
					billingUnits: 100,
					price: 10,
				}),
			],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV2_2, ctx, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proAnnual, premium] }),
			],
			actions: [
				s.billing.attach({ productId: proAnnual.id }),
				s.advanceTestClock({ months: 2, days: 15 }),
			],
		});

		const { total: expectedTotal } =
			await calculateAnchorResetNoPartialRefundTotal({
				customerId,
				advancedTo,
				oldAmount: 200,
				newAmount: 50,
				refundCycleInterval: EntInterval.Month,
				interval: "year",
			});

		const preview = await autumnV2_2.billing.previewAttach<AttachParamsV1Input>(
			{
				customer_id: customerId,
				plan_id: premium.id,
				billing_cycle_anchor: "now",
				proration_behavior: "none",
				carry_over_balances: { enabled: true },
				plan_schedule: "immediate",
			},
		);

		expectTotalEqual({ actual: preview.total, expected: expectedTotal });

		const result = await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: premium.id,
			billing_cycle_anchor: "now",
			proration_behavior: "none",
			carry_over_balances: { enabled: true },
			redirect_mode: "if_required",
		});

		expect(result.invoice).toBeDefined();
		expectTotalEqual({
			actual: result.invoice?.total ?? 0,
			expected: expectedTotal,
		});

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({
			customer,
			active: [premium.id],
			notPresent: [proAnnual.id],
		});

		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);
