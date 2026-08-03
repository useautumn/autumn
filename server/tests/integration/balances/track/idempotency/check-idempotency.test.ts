/**
 * Idempotency on /check.
 *
 * Contract under test:
 *   - The `Idempotency-Key` header applies to check like any apiRouter route:
 *     a successful check keeps the key → an identical retry gets 409.
 *   - Check has no body idempotency_key; the body-level dedup mechanism for
 *     check is the lock — a second check with the same lock_id is refused
 *     (lock_already_exists) until the lock is finalized or expires.
 */

import { test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { deleteLock } from "@tests/integration/balances/utils/lockUtils/deleteLock.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("check idempotency: header key on a successful check, retry gets 409")}`,
	async () => {
		const freeProd = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 20 })],
		});

		const { autumnV2_1, customerId } = await initScenario({
			customerId: "check-idem-header",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		const headerKey = `check-header-${Date.now().toString(36)}`;
		const check = () =>
			autumnV2_1.check(
				{
					customer_id: customerId,
					feature_id: TestFeature.Messages,
				},
				{ headers: { "Idempotency-Key": headerKey } },
			);

		await check();

		await expectAutumnError({
			errCode: ErrCode.DuplicateIdempotencyKey,
			func: check,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("check idempotency: lock_id is the body-level dedup — same lock_id twice is refused")}`,
	async () => {
		const freeProd = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 20 })],
		});

		const customerId = "check-idem-lock";
		const { autumnV2_1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		await deleteLock({ ctx, lockId: customerId });

		const checkWithLock = () =>
			autumnV2_1.check({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				required_balance: 5,
				lock: { enabled: true, lock_id: customerId },
			});

		await checkWithLock();

		await expectAutumnError({
			errCode: ErrCode.LockAlreadyExists,
			func: checkWithLock,
		});
	},
);
