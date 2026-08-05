// Before: a future phase anchor reset previews a partial cycle from the saved schedule start.
// After: it previews a full new cycle minus the unused current-plan credit.

import { expect, test } from "bun:test";
import {
	type AttachPreviewResponse,
	applyProration,
	type CreateScheduleParamsV0Input,
	ms,
	truncateMsToSecondPrecision,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { addMonths } from "date-fns";

test.concurrent(
	"create-schedule preview: future plan transition with phase anchor reset starts a full cycle",
	async () => {
		const currentPlan = products.pro({
			id: "phase-anchor-preview-current",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const nextPlan = products.premium({
			id: "phase-anchor-preview-next",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const { customerId, autumnV1, advancedTo } = await initScenario({
			customerId: "create-schedule-phase-anchor-reset-preview",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [currentPlan, nextPlan] }),
			],
			actions: [],
		});

		const currentPlanEndsAt = truncateMsToSecondPrecision(
			addMonths(advancedTo, 1).getTime(),
		);
		const transitionAt = currentPlanEndsAt - ms.days(2);
		const phases: CreateScheduleParamsV0Input["phases"] = [
			{ starts_at: advancedTo, plans: [{ plan_id: currentPlan.id }] },
			{ starts_at: transitionAt, plans: [{ plan_id: nextPlan.id }] },
		];

		await autumnV1.billing.createSchedule({
			customer_id: customerId,
			billing_behavior: "none",
			phases,
		});

		const preview: AttachPreviewResponse = await autumnV1.post(
			"/billing.preview_create_schedule",
			{
				customer_id: customerId,
				billing_behavior: "none",
				phases: [
					phases[0],
					{ ...phases[1], billing_cycle_anchor: "phase_start" },
				],
			},
		);
		const unusedCurrentPlan = applyProration({
			now: transitionAt,
			billingPeriod: { start: advancedTo, end: currentPlanEndsAt },
			amount: 20,
		});
		const positiveTotal = preview.next_cycle?.line_items
			.filter((lineItem) => lineItem.total > 0)
			.reduce((total, lineItem) => total + lineItem.total, 0);

		expect(preview.total).toBe(0);
		expect(positiveTotal).toBeCloseTo(50, 2);
		expect(preview.next_cycle?.total).toBeCloseTo(50 - unusedCurrentPlan, 2);
		expect(preview.next_cycle?.starts_at).toBe(transitionAt);
	},
);
