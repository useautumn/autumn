/**
 * TDD test for finalize-lock events being written with `deductions: null`.
 * Lock unwinds (credit returned when actual usage < reservation) are invisible
 * in the per-balance breakdown because insertFinalizeLockEventV2 never receives
 * the mutation logs the deduction engine produced.
 *
 * Red-failure mode (pre-fix): the finalize runners discarded the deduction
 * engine's mutationLogs, so the finalize event (value = finalValue - lockValue,
 * negative on unwind) was written with `deductions: null` and
 * internal_product_id null.
 *
 * Green-success criteria (post-fix):
 *  - The finalize event carries a non-empty `deductions` array whose row has
 *    the monthly balance and a NEGATIVE value equal to the unwound amount,
 *    plus a resolved internal_product_id.
 */

import { expect, test } from "bun:test";
import { ApiVersion, events } from "@autumn/shared";
import { AutumnInt } from "@server/external/autumn/autumnCli.js";
import { timeout } from "@server/utils/genUtils.js";
import { eventsDb } from "@tests/integration/balances/utils/events/getCustomerEvents.js";
import { deleteLock } from "@tests/integration/balances/utils/lockUtils/deleteLock.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, desc, eq } from "drizzle-orm";

/** Fetch full event rows (incl. deductions + internal_product_id) newest-first. */
const getFullCustomerEvents = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const autumnV2 = new AutumnInt({ version: ApiVersion.V2_0 });
	const customer = await autumnV2.customers.get(customerId, {
		with_autumn_id: true,
	});

	return eventsDb()
		.select()
		.from(events)
		.where(
			and(
				eq(events.internal_customer_id, customer.autumn_id ?? ""),
				eq(events.org_id, ctx.org.id),
				eq(events.env, ctx.env),
			),
		)
		.orderBy(desc(events.created_at))
		.limit(100);
};

test.concurrent(
	`${chalk.yellowBright("finalize lock unwind: finalize event carries deductions with negative value")}`,
	async () => {
		const customerId = "finalize-lock-event-deductions";
		const monthlyMessages = items.monthlyMessages({ includedUsage: 100 });
		const freeProd = products.base({
			id: "free",
			items: [monthlyMessages],
		});

		const { autumnV2_1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		await deleteLock({ ctx, lockId: customerId });

		// Reserve 10, then finalize with actual usage of 4 → unwind of 6.
		await autumnV2_1.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 10,
			lock: { enabled: true, lock_id: customerId },
		});

		await autumnV2_1.balances.finalize({
			lock_id: customerId,
			action: "confirm",
			override_value: 4,
		});

		// Wait for event batching to flush, then read events (newest-first).
		await timeout(3000);
		const eventRows = await getFullCustomerEvents({ customerId });

		// eventRows[0] = finalize delta (4 - 10 = -6), eventRows[1] = check track (10)
		expect(eventRows).toHaveLength(2);
		const finalizeEvent = eventRows[0];
		expect(finalizeEvent.value).toBe(-6);

		// The bug: deductions is null, so the unwind is invisible per-balance.
		expect(finalizeEvent.deductions).toBeArray();
		expect(finalizeEvent.deductions).toHaveLength(1);

		const deduction = finalizeEvent.deductions?.[0];
		expect(deduction?.feature_id).toBe(TestFeature.Messages);
		expect(deduction?.value).toBe(-6);
		expect(deduction?.balance_id).toBeString();

		// Finalize events should also resolve the product like track events do.
		expect(finalizeEvent.internal_product_id).not.toBeNull();
	},
);
