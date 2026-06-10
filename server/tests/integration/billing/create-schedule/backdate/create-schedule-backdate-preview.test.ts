/**
 * Preview accuracy for backdated first phases in create_schedule.
 *
 * Contract under test:
 *   - Immediate preview total = sum of first-phase base prices × elapsed cycles
 *     (Stripe's backdate_start_date invoices one period per elapsed cycle), and
 *     equals the executed createSchedule invoice total.
 *   - next_cycle is the NEXT chronological event:
 *       Case A (phase 2 lands after the renewal boundary): next_cycle is the
 *         renewal — anchored to starts_at, charging one full first-phase cycle.
 *       Case B (phase 2 lands before the renewal boundary): next_cycle is the
 *         prorated phase-2 replacement at phase 2 starts_at — incoming plan
 *         charged and outgoing plan credited over the remaining window.
 *   - Feature resets (next_reset_at) align to the backdated anchor.
 */

import { expect, test } from "bun:test";
import {
	type AttachPreviewResponse,
	BillingInterval,
	type CreateScheduleParamsV0Input,
	getCycleEnd,
	ms,
} from "@autumn/shared";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { createAmountCoupon } from "../../utils/discounts/discountTestUtils";
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

test.concurrent(
	`${chalk.yellowBright("create-schedule backdate preview A: multi-plan first phase bills elapsed cycles, next_cycle is the renewal")}`,
	async () => {
		const customerId = "create-schedule-backdate-preview-renewal";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const addon = products.recurringAddOn({
			id: "addon",
			items: [items.monthlyWords({ includedUsage: 25 })],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV1, ctx, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon, premium] }),
			],
			actions: [],
		});

		// 40 days back spans two monthly cycles regardless of month length.
		const phase1StartsAt = advancedTo - ms.days(40);
		// 60 days out lands well after the renewal boundary (~20 days out).
		const phase2StartsAt = advancedTo + ms.days(60);

		const params: CreateScheduleParamsV0Input = {
			customer_id: customerId,
			phases: [
				{
					starts_at: phase1StartsAt,
					plans: [{ plan_id: pro.id }, { plan_id: addon.id }],
				},
				{
					starts_at: phase2StartsAt,
					plans: [{ plan_id: premium.id }],
				},
			],
		};

		const preview = await previewCreateSchedule({ autumnV1, params });

		// Two elapsed cycles × (pro $20 + addon $20) = $80 now.
		expect(preview.total).toBe(80);
		expect(preview.subtotal).toBe(80);
		expect(
			preview.line_items.reduce((sum, lineItem) => sum + lineItem.total, 0),
		).toBe(preview.total);

		// Phase 2 is after the renewal, so next_cycle is the renewal: one full
		// first-phase cycle (pro $20 + addon $20), anchored two months past start.
		expectPreviewNextCycleCorrect({
			preview,
			startsAt: addMonths(phase1StartsAt, 2).getTime(),
			total: 40,
		});

		const response = await autumnV1.billing.createSchedule(params);
		expect(response.status).toBe("created");
		// preview.total must equal the real backdated invoice total.
		expect(response.invoice?.total).toBe(preview.total);

		// Reset aligns to the backdated anchor: next reset is two months past start.
		const proCusProduct = await getCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		expectResetAnchoredTo({
			cusProduct: proCusProduct,
			featureId: TestFeature.Messages,
			startDate: addMonths(phase1StartsAt, 1).getTime(),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule backdate preview C: amount-off discount applies once to backdated immediate invoice")}`,
	async () => {
		const customerId = "create-schedule-backdate-preview-discount";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV1, ctx, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [],
		});

		const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
		const coupon = await createAmountCoupon({
			stripeCli,
			amountOffCents: 500,
			durationInMonths: 12,
		});
		const phase1StartsAt = advancedTo - ms.days(40);
		const phase2StartsAt = advancedTo + ms.days(60);

		const params: CreateScheduleParamsV0Input = {
			customer_id: customerId,
			discounts: [{ reward_id: coupon.id }],
			phases: [
				{
					starts_at: phase1StartsAt,
					plans: [{ plan_id: pro.id }],
				},
				{
					starts_at: phase2StartsAt,
					plans: [{ plan_id: premium.id }],
				},
			],
		};

		const preview = await previewCreateSchedule({ autumnV1, params });

		expect(preview.subtotal).toBe(40);
		expect(preview.total).toBe(35);
		expect(preview.line_items[0]?.period).toEqual({
			start: phase1StartsAt,
			end: addMonths(phase1StartsAt, 2).getTime(),
		});
		expectPreviewNextCycleCorrect({
			preview,
			startsAt: addMonths(phase1StartsAt, 2).getTime(),
			total: 15,
		});

		const response = await autumnV1.billing.createSchedule(params);
		expect(response.status).toBe("created");
		expect(response.invoice?.total).toBe(preview.total);
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule backdate preview B: phase 2 before renewal is a prorated upgrade in next_cycle")}`,
	async () => {
		const customerId = "create-schedule-backdate-preview-prorated";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV1, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [],
		});

		// 25 days back = one elapsed cycle; phase 2 one day out sits before the
		// renewal boundary (>= 3 days out), so it is a mid-cycle scheduled change.
		const phase1StartsAt = advancedTo - ms.days(25);
		const phase2StartsAt = advancedTo + ms.days(1);

		const params: CreateScheduleParamsV0Input = {
			customer_id: customerId,
			phases: [
				{
					starts_at: phase1StartsAt,
					plans: [{ plan_id: pro.id }],
				},
				{
					starts_at: phase2StartsAt,
					plans: [{ plan_id: premium.id }],
				},
			],
		};

		const preview = await previewCreateSchedule({ autumnV1, params });

		// One elapsed cycle of pro ($20) now.
		expect(preview.total).toBe(20);
		expect(preview.subtotal).toBe(20);

		// next_cycle is the phase-2 replacement, prorated over the remaining window.
		const renewalMs = getCycleEnd({
			anchor: phase1StartsAt,
			interval: BillingInterval.Month,
			intervalCount: 1,
			now: phase2StartsAt,
			floor: phase1StartsAt,
		});
		const ratio = (renewalMs - phase2StartsAt) / (renewalMs - phase1StartsAt);
		// Incoming premium ($50) charged minus outgoing pro ($20) credited, prorated.
		const expectedNextTotal = Math.round(ratio * (50 - 20) * 100) / 100;

		const nextCycle = expectPreviewNextCycleCorrect({
			preview,
			startsAt: phase2StartsAt,
		});

		expect(
			Math.abs((nextCycle?.total ?? 0) - expectedNextTotal) < 0.1,
			`next_cycle.total ${nextCycle?.total} should be within 0.1 of prorated ${expectedNextTotal}`,
		).toBe(true);

		// The change shows an incoming premium charge and an outgoing pro credit.
		const lineItems = nextCycle?.line_items ?? [];
		expect(lineItems.some((lineItem) => lineItem.total > 0)).toBe(true);
		expect(lineItems.some((lineItem) => lineItem.total < 0)).toBe(true);

		const response = await autumnV1.billing.createSchedule(params);
		expect(response.status).toBe("created");
		expect(response.invoice?.total).toBe(preview.total);
	},
);
