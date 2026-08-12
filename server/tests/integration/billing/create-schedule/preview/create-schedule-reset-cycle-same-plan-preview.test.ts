// A same-plan phase transition with a billing-cycle reset previews a fresh full
// cycle: the plan is charged in full with no unused-time credit netted against it.

import { expect, test } from "bun:test";
import {
	type AttachPreviewResponse,
	type CreateScheduleParamsV0Input,
	ms,
	truncateMsToSecondPrecision,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { addMonths } from "date-fns";

test.concurrent(
	"create-schedule preview: same-plan reset-billing-cycle charges the full base",
	async () => {
		const plan = products.pro({
			id: "reset-cycle-same-plan-preview",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { customerId, autumnV1, advancedTo } = await initScenario({
			customerId: "create-schedule-reset-cycle-same-plan",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [],
		});

		const currentPlanEndsAt = truncateMsToSecondPrecision(
			addMonths(advancedTo, 1).getTime(),
		);
		// Transition a sliver before the natural period end, which previously left
		// a small unused-current-plan credit despite the reset.
		const transitionAt = currentPlanEndsAt - ms.hours(16);

		const phases: CreateScheduleParamsV0Input["phases"] = [
			{ starts_at: advancedTo, plans: [{ plan_id: plan.id }] },
			{
				starts_at: transitionAt,
				plans: [{ plan_id: plan.id }],
				billing_cycle_anchor: "phase_start",
			},
		];

		const preview: AttachPreviewResponse = await autumnV1.post(
			"/billing.preview_create_schedule",
			{
				customer_id: customerId,
				billing_behavior: "none",
				phases,
			},
		);

		const fullBase = 20;
		const hasCreditLine = (preview.next_cycle?.line_items ?? []).some(
			(lineItem) => lineItem.total < 0,
		);

		expect(preview.next_cycle?.starts_at).toBe(transitionAt);
		expect(hasCreditLine).toBe(false);
		expect(preview.next_cycle?.total).toBeCloseTo(fullBase, 2);
	},
);
