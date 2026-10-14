import { expect, test } from "bun:test";
import { BillingInterval, type SetPlansParamsV0Input } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";

const UPGRADED_PRICE = 80;

test(`${chalk.yellowBright("set-plans replayed start reset: phase_start on the saved start warns, starting now moves the cycle")}`, async () => {
	const free = products.base({ id: "free", isDefault: true, items: [] });
	const pro = products.pro({ items: [items.monthlyMessages()] });
	const { customerId, autumnV1, autumnV2_4, ctx } = await initScenario({
		customerId: "set-plans-replayed-start-reset",
		setup: [
			s.products({ list: [free, pro] }),
			s.customer({ paymentMethod: "success", withDefault: true }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.advanceTestClock({ days: 6 }),
		],
	});
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_end_of_cycle",
	});

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const savedStart = fullCustomer.customer_products.find(
		(customerProduct) => customerProduct.product.id === pro.id,
	)!.starts_at;

	const params = ({
		startsAt,
	}: {
		startsAt: number | "now";
	}): SetPlansParamsV0Input => ({
		customer_id: customerId,
		phases: [
			{
				starts_at: startsAt,
				billing_cycle_anchor: "phase_start",
				proration_behavior: "prorate_immediately",
				plans: [
					{
						plan_id: pro.id,
						customize: {
							price: {
								amount: UPGRADED_PRICE,
								interval: BillingInterval.Month,
							},
						},
					},
				],
			},
		],
	});

	const replayed = await autumnV2_4.billing.previewSetPlans(
		params({ startsAt: savedStart }),
	);
	expect(replayed.warnings.map(({ type }) => type)).toContain(
		"cycle_reset_ignored",
	);

	const startsNow = await autumnV2_4.billing.previewSetPlans(
		params({ startsAt: "now" }),
	);
	expect(startsNow.next_cycle?.starts_at).toBeGreaterThan(
		replayed.next_cycle?.starts_at ?? Number.POSITIVE_INFINITY,
	);
	expect(startsNow.warnings.map(({ type }) => type)).not.toContain(
		"cycle_reset_ignored",
	);
});
