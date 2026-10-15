import { expect, test } from "bun:test";
import {
	BillingInterval,
	ms,
	type SetPlansParamsV0Input,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("preview-set-plans: a phase repeating the one before it still lists its plans")}`,
	async () => {
		const customerId = "preview-set-plans-repeated-phase";
		const enterprise = products.base({
			id: "preview-repeated-enterprise",
			items: [items.annualPrice({ price: 18000 }), items.dashboard()],
		});
		const { autumnV2_4, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [enterprise] }),
			],
			actions: [s.billing.attach({ productId: enterprise.id })],
		});

		const renewal = (startsAt: number) => ({
			starts_at: startsAt,
			billing_cycle_anchor: "phase_start" as const,
			plans: [
				{
					plan_id: enterprise.id,
					customize: {
						price: { amount: 20000, interval: BillingInterval.Year },
					},
				},
			],
		});
		const renewalStart = advancedTo + ms.days(110);
		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			phases: [
				{ starts_at: "now", plans: [{ plan_id: enterprise.id }] },
				renewal(renewalStart),
				renewal(renewalStart + ms.days(365)),
			],
		};
		const repeatedPhase = async () => {
			const preview = await autumnV2_4.billing.previewSetPlans(params);
			const [, , phase] = preview.phases;
			return {
				plans: phase.plans.map((plan) => plan.plan_id),
				reviewTitles: preview.review.plans.phases[2]?.rows.map(
					(row) => row.title,
				),
				planNames: phase.plans.map((plan) => plan.name),
			};
		};
		const assertListed = async () => {
			const { plans, reviewTitles, planNames } = await repeatedPhase();
			expect(plans).toEqual([enterprise.id]);
			expect(reviewTitles).toEqual(planNames);
		};

		// Adding the repeated phase, then reopening it once saved.
		await assertListed();
		await autumnV2_4.billing.setPlans(params);
		await assertListed();
	},
);
