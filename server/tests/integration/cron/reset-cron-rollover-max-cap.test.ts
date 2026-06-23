/**
 * TDD test for rollover `max` not being enforced on the reset-cron path.
 *
 * The cron loader (CusEntService.getActiveResetPassed) maps every cusEnt with a
 * hardcoded `rollovers: []`. RolloverService.clearExcessRollovers then computes
 * `[...fullCusEnt.rollovers, ...newRows]`, so it only ever sees the single new
 * row and never the previously-accumulated forever-expiry rows — the cap never
 * fires. With an hourly reset + forever rollover this compounds every cycle.
 *
 * Red-failure mode (current behavior):
 *  - After N cron resets, total rollover balance grows ~N * included, far past `max`.
 *
 * Green-success criteria (after fix):
 *  - clearExcessRollovers sources the authoritative rollover set from the DB, so
 *    total rollover balance is capped at `max` regardless of caller-supplied state.
 */

import { expect, test } from "bun:test";
import {
	customerEntitlements,
	ProductItemInterval,
	type ResetCusEnt,
	RolloverExpiryDurationType,
	rollovers,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { resetCustomerEntitlement } from "@/cron/resetCron/resetCustomerEntitlement";
import { CusService } from "@/internal/customers/CusService";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem";

const INCLUDED = 300;
const ROLLOVER_MAX = 1080;
const RESET_CYCLES = 10;

test.concurrent(
	`${chalk.yellowBright("reset cron rollover: forever rollover stays capped at max across hourly resets")}`,
	async () => {
		const customerId = "reset-cron-rollover-max-cap";

		const fairuseItem = constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: INCLUDED,
			interval: ProductItemInterval.Hour,
			intervalCount: 5,
			rolloverConfig: {
				max: ROLLOVER_MAX,
				length: 1,
				duration: RolloverExpiryDurationType.Forever,
			},
		});

		const plan = products.base({
			id: "reset-cron-rollover-max-cap",
			items: [fairuseItem],
		});

		const { ctx } = await initScenario({
			customerId,
			setup: [s.customer(), s.products({ list: [plan] })],
			actions: [s.attach({ productId: plan.id })],
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			skipReset: true,
		});
		const cusEntId = fullCustomer.customer_products
			.flatMap((customerProduct) => customerProduct.customer_entitlements)
			.find(
				(cusEnt) => cusEnt.entitlement.feature_id === TestFeature.Messages,
			)?.id;
		if (!cusEntId) {
			throw new Error(`Expected messages entitlement for ${customerId}`);
		}

		// Force the reset to be overdue so the cron loader picks it up.
		const now = Date.now();
		await ctx.db
			.update(customerEntitlements)
			.set({ next_reset_at: now - 1000 })
			.where(eq(customerEntitlements.id, cusEntId));

		// Load the cusEnt exactly as the cron does (rollovers hardcoded to []).
		const resetCusEnts = await CusEntService.getActiveResetPassed({
			db: ctx.db,
			customDateUnix: now,
		});
		const cronCusEnt = resetCusEnts.find((cusEnt) => cusEnt.id === cusEntId);
		expect(
			cronCusEnt,
			"cusEnt should be selected by getActiveResetPassed",
		).toBeDefined();
		expect(cronCusEnt?.rollovers).toEqual([]);

		// Drive several reset cycles. The short-duration reset path does not
		// persist balance/next_reset_at itself, so the unused INCLUDED balance
		// is banked each cycle.
		for (let cycle = 0; cycle < RESET_CYCLES; cycle++) {
			const updatedCusEnts: ResetCusEnt[] = [];
			await resetCustomerEntitlement({
				ctx,
				cusEnt: cronCusEnt as ResetCusEnt,
				updatedCusEnts,
			});
		}

		const rolloverRows = await ctx.db
			.select()
			.from(rollovers)
			.where(eq(rollovers.cus_ent_id, cusEntId));

		const totalRolloverBalance = rolloverRows.reduce(
			(sum, row) => sum + row.balance,
			0,
		);

		expect(
			totalRolloverBalance,
			`total rollover balance ${totalRolloverBalance} exceeded max ${ROLLOVER_MAX} after ${RESET_CYCLES} hourly resets`,
		).toBeLessThanOrEqual(ROLLOVER_MAX);

		// Guard against passing the cap by accumulating many small uncleared rows:
		// trimming should keep the row count bounded too.
		const maxExpectedRows = Math.ceil(ROLLOVER_MAX / INCLUDED) + 1;
		expect(
			rolloverRows.length,
			`expected at most ${maxExpectedRows} rollover rows after ${RESET_CYCLES} cycles`,
		).toBeLessThanOrEqual(maxExpectedRows);
	},
);
