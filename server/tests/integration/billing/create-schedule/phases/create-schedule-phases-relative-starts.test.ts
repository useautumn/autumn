/**
 * TDD test for symbolic and relative create_schedule phase starts.
 *
 * Contract under test:
 *   New types/fields:
 *     - phases[].starts_at: number | "now"
 *     - phases[].starting_after: { duration_type: "month" | "year"; duration_count: positive integer }
 *   New endpoints:
 *     - Existing billing.createSchedule accepts symbolic and relative phase starts
 *   New behaviors:
 *     - starts_at: "now" resolves to the test-clock-aware current time
 *     - starting_after resolves from the previous resolved phase start
 *   Side effects:
 *     - Response phases, DB schedule phases, and customer_products store resolved numeric timestamps
 */

import { expect, test } from "bun:test";
import {
	addDuration,
	type CreateScheduleParamsV0Input,
	CusProductStatus,
	customerProducts,
	schedulePhases,
	StartingAfterDuration,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { asc, eq, inArray } from "drizzle-orm";
import { getRequiredScheduleId } from "../utils/createScheduleTestHelpers";

test.concurrent(
	`${chalk.yellowBright("create-schedule phases: resolves now and starting_after")}`,
	async () => {
		const customerId = "create-schedule-relative-starts";
		const pro = products.pro({
			id: "relative-starts-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "relative-starts-premium",
			items: [items.monthlyMessages({ includedUsage: 200 })],
		});
		const enterprise = products.pro({
			id: "relative-starts-enterprise",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV1, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
				s.products({ list: [pro, premium, enterprise] }),
			],
			actions: [],
		});

		if (!testClockId) throw new Error("Expected testClockId from initScenario");

		const testClock = await ctx.stripeCli.testHelpers.testClocks.retrieve(
			testClockId,
		);
		const expectedPhase1StartsAt = testClock.frozen_time * 1000;
		const expectedPhase2StartsAt = addDuration({
			now: expectedPhase1StartsAt,
			durationType: StartingAfterDuration.Month,
			durationLength: 2,
		});
		const expectedPhase3StartsAt = addDuration({
			now: expectedPhase2StartsAt,
			durationType: StartingAfterDuration.Year,
			durationLength: 1,
		});

		const params: CreateScheduleParamsV0Input = {
			customer_id: customerId,
			phases: [
				{
					starts_at: "now",
					plans: [{ plan_id: pro.id }],
				},
				{
					starting_after: {
						duration_type: StartingAfterDuration.Month,
						duration_count: 2,
					},
					plans: [{ plan_id: premium.id }],
				},
				{
					starting_after: {
						duration_type: StartingAfterDuration.Year,
						duration_count: 1,
					},
					plans: [{ plan_id: enterprise.id }],
				},
			],
		};

		const response = await autumnV1.billing.createSchedule(params);
		const scheduleId = getRequiredScheduleId(response.schedule_id);

		expect(response.status).toBe("created");
		expect(response.phases.map((phase) => phase.starts_at)).toEqual([
			expectedPhase1StartsAt,
			expectedPhase2StartsAt,
			expectedPhase3StartsAt,
		]);

		const dbPhases = await ctx.db
			.select({
				starts_at: schedulePhases.starts_at,
				customer_product_ids: schedulePhases.customer_product_ids,
			})
			.from(schedulePhases)
			.where(eq(schedulePhases.schedule_id, scheduleId))
			.orderBy(asc(schedulePhases.starts_at));

		expect(dbPhases.map((phase) => phase.starts_at)).toEqual([
			expectedPhase1StartsAt,
			expectedPhase2StartsAt,
			expectedPhase3StartsAt,
		]);
		expect(dbPhases.every((phase) => phase.customer_product_ids.length === 1)).toBe(
			true,
		);

		const customerProductIds = response.phases.flatMap(
			(phase) => phase.customer_product_ids,
		);
		const productRows = await ctx.db
			.select({
				product_id: customerProducts.product_id,
				status: customerProducts.status,
				starts_at: customerProducts.starts_at,
				ended_at: customerProducts.ended_at,
			})
			.from(customerProducts)
			.where(inArray(customerProducts.id, customerProductIds));
		const productRowByProductId = new Map(
			productRows.map((row) => [row.product_id, row]),
		);

		expect(productRowByProductId.get(pro.id)).toMatchObject({
			status: CusProductStatus.Active,
			starts_at: expectedPhase1StartsAt,
			ended_at: expectedPhase2StartsAt,
		});
		expect(productRowByProductId.get(premium.id)).toMatchObject({
			status: CusProductStatus.Scheduled,
			starts_at: expectedPhase2StartsAt,
			ended_at: expectedPhase3StartsAt,
		});
		expect(productRowByProductId.get(enterprise.id)).toMatchObject({
			status: CusProductStatus.Scheduled,
			starts_at: expectedPhase3StartsAt,
			ended_at: null,
		});
	},
);
