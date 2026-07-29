/**
 * TDD test for end-to-end finalize-lock queued replay.
 *
 * Contract under test:
 *   New behaviors:
 *     - a JobName.FinalizeLock message on the track queue (the payload
 *       runFinalizeLock's outage fallback enqueues) is processed by the
 *       worker: the lock is released, the reserved balance refunded, and
 *       the receipt + claim marker deleted
 *
 * Pre-impl red: JobName.FinalizeLock does not exist / the worker has no
 * dispatch case, so the queued message is dropped and the balance stays
 * reserved.
 * Post-impl green: the replay releases the lock within the poll window.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { deleteLock } from "@tests/integration/balances/utils/lockUtils/deleteLock.js";
import { expectLockReceiptDeleted } from "@tests/integration/balances/utils/lockUtils/expectLockReceiptDeleted.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { timeout } from "@/utils/genUtils";

const POLL_INTERVAL_MS = 2000;
const POLL_DEADLINE_MS = 60_000;

test.concurrent(
	`${chalk.yellowBright("finalize-lock-queued-replay 1: queued release job refunds the reserved balance")}`,
	async () => {
		const hourlyMessages = items.hourlyMessages({ includedUsage: 5 });
		const monthlyMessages = items.monthlyMessages({ includedUsage: 10 });
		const freeProd = products.base({
			id: "free",
			items: [hourlyMessages, monthlyMessages],
		});

		const customerId = `finalize-queued-replay-${Date.now()}`;
		const { autumnV2_1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		await deleteLock({ ctx, lockId: customerId });

		await autumnV2_1.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 8,
			lock: { enabled: true, lock_id: customerId },
		});

		const customerLocked =
			await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: customerLocked,
			featureId: TestFeature.Messages,
			remaining: 7,
		});

		// The exact message runFinalizeLock's outage fallback enqueues.
		await addTaskToQueue({
			jobName: JobName.FinalizeLock,
			queueUrl: process.env.TRACK_SQS_QUEUE_URL,
			messageGroupId: `${ctx.org.id}:${ctx.env}:lock:${customerId}`,
			messageDeduplicationId: `${customerId}-release`,
			payload: {
				orgId: ctx.org.id,
				env: ctx.env,
				customerId,
				requestId: `${customerId}-release`,
				params: {
					lock_id: customerId,
					action: "release",
					override_value: 0,
				},
			},
		});

		const deadline = Date.now() + POLL_DEADLINE_MS;
		let remaining: number | undefined;
		while (Date.now() < deadline) {
			const customer =
				await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
			remaining = customer.balances[TestFeature.Messages]?.remaining;
			if (remaining === 15) break;
			await timeout(POLL_INTERVAL_MS);
		}

		expect(remaining).toBe(15);
		await expectLockReceiptDeleted({ ctx, lockId: customerId });
	},
);
