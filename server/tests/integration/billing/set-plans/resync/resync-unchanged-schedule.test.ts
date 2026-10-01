/**
 * Resubmitting a customer's schedule unchanged leaves it untouched: same rows, same Stripe schedule, nothing due.
 *
 * Red (before):  every scheduled row was deleted and recreated, and the Stripe schedule rebuilt, so an
 *                untouched Set Plans sheet warned that the scheduled plans and schedule would be replaced.
 * Green (after): identical future-phase plans keep their rows and the live Stripe schedule; the preview shows
 *                the saved change as already scheduled (origin saved), not as a request change.
 */

import { expect, test } from "bun:test";
import {
	CusProductStatus,
	ms,
	type SetPlansParamsV0Input,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";
import { findStripeSubscriptionByStatus } from "../utils/subscriptionStateUtils";

const REBUILD_WARNINGS = ["existing_schedule_replaced", "future_phase_removed"];

/** Row ids per plan and status, so a resubmit can be compared row for row. */
const customerProductIdsByPlan = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		inStatuses: [CusProductStatus.Active, CusProductStatus.Scheduled],
	});
	return fullCustomer.customer_products
		.map((customerProduct) => ({
			planId: customerProduct.product_id,
			status: customerProduct.status,
			id: customerProduct.id,
			startsAt: customerProduct.starts_at,
		}))
		.sort((a, b) => a.planId.localeCompare(b.planId));
};

test.concurrent(
	`${chalk.yellowBright("set-plans unchanged schedule: resubmitting the same phases keeps every row and the Stripe schedule")}`,
	async () => {
		const pro = products.pro({ items: [items.monthlyMessages()] });
		const premium = products.base({
			id: "unchanged-schedule-premium",
			items: [
				items.monthlyMessages({ includedUsage: 500 }),
				items.monthlyPrice({ price: 50 }),
			],
		});

		const { customerId, autumnV2_4, ctx } = await initScenario({
			customerId: "set-plans-unchanged-schedule",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [],
		});

		await autumnV2_4.billing.setPlans({
			customer_id: customerId,
			phases: [
				{ starts_at: "now", plans: [{ plan_id: pro.id }] },
				{
					starts_at: Date.now() + ms.days(30),
					plans: [{ plan_id: premium.id }],
				},
			],
		});

		const rowsBefore = await customerProductIdsByPlan({ ctx, customerId });
		const scheduledStart = rowsBefore.find(
			(row) => row.status === CusProductStatus.Scheduled,
		)?.startsAt;
		const scheduleBefore = (
			await findStripeSubscriptionByStatus({
				ctx,
				customerId,
				status: "active",
			})
		).schedule;
		expect(scheduledStart).toBeDefined();
		expect(scheduleBefore).toBeTruthy();

		// The prefilled sheet dates each future phase to its scheduled row.
		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			phases: [
				{ starts_at: "now", plans: [{ plan_id: pro.id }] },
				{
					starts_at: scheduledStart as number,
					plans: [{ plan_id: premium.id }],
				},
			],
		};

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.total).toBe(0);
		expect(
			preview.phases.map((phase) => ({
				statuses: phase.plans.map((plan) => `${plan.status}:${plan.origin}`),
				stripeItems: phase.processor_items.length,
			})),
		).toEqual([
			{ statuses: ["kept:request"], stripeItems: 1 },
			{ statuses: ["starts:saved", "ends:saved"], stripeItems: 1 },
		]);
		expect(
			preview.warnings
				.map((warning) => warning.type)
				.filter((type) => REBUILD_WARNINGS.includes(type)),
		).toEqual([]);

		await autumnV2_4.billing.setPlans(params);

		expect(await customerProductIdsByPlan({ ctx, customerId })).toEqual(
			rowsBefore,
		);
		const scheduleAfter = (
			await findStripeSubscriptionByStatus({
				ctx,
				customerId,
				status: "active",
			})
		).schedule;
		expect(scheduleAfter).toEqual(scheduleBefore);
	},
);
