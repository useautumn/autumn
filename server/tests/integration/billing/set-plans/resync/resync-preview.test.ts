/**
 * The resync preview shows what the rebuilt subscription bills.
 *
 * Contract:
 *   - Total $0 now: proration_behavior none with a future anchor charges nothing.
 *   - The next cycle starts on the anchor and bills the full $20.
 *   - The preview states that a new Stripe subscription is created.
 */

import { expect, test } from "bun:test";
import type { SetPlansParamsV0Input } from "@autumn/shared";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { cancelSubscriptionForResync } from "../utils/resyncUtils";

test.concurrent(
	`${chalk.yellowBright("set-plans resync preview: $0 now and the next cycle on the anchor")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { customerId, autumnV2_4, ctx } = await initScenario({
			customerId: "set-plans-resync-preview",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.advanceTestClock({ days: 10 }),
			],
		});

		const { oldStartMs, oldPeriodEndMs } = await cancelSubscriptionForResync({
			ctx,
			customerId,
		});

		const preview =
			await autumnV2_4.billing.previewSetPlans<SetPlansParamsV0Input>({
				customer_id: customerId,
				billing_cycle_anchor: oldPeriodEndMs,
				proration_behavior: "none",
				phases: [{ starts_at: oldStartMs, plans: [{ plan_id: pro.id }] }],
			});

		expect(preview.total).toBe(0);
		expectPreviewNextCycleCorrect({
			preview,
			startsAt: oldPeriodEndMs,
			total: 20,
			toleranceMs: 1000,
		});
		expect(preview.processor_changes).toContainEqual({
			type: "subscription",
			id: null,
			action: "created",
		});
	},
);
