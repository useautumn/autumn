import { expect, test } from "bun:test";
import { ApiVersion, ErrCode } from "@autumn/shared";
import { deleteLock } from "@tests/integration/balances/utils/lockUtils/deleteLock.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	expectCustomerBalance,
	expectCustomerUsageLimit,
	setCustomerUsageLimit,
} from "../utils/usage-limit-utils/customerUsageLimitUtils.js";

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

test.concurrent(
	`${chalk.yellowBright("usage-window-lock1: a lock consumes window headroom; an over-cap lock is rejected")}`,
	async () => {
		const freePlan = products.base({
			id: "uw-check-lock",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = "uw-check-lock-1";
		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freePlan] }),
			],
			actions: [s.billing.attach({ productId: freePlan.id })],
		});
		await deleteLock({ ctx, lockId: `${customerId}-a` });
		await deleteLock({ ctx, lockId: `${customerId}-b` });

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			limit: 5,
		});

		const granted = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 4,
			lock: { enabled: true, lock_id: `${customerId}-a` },
		});
		expect(granted.allowed).toBe(true);
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			remaining: 96,
			usage: 4,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 4,
			limit: 5,
		});

		const rejected = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 2,
			lock: { enabled: true, lock_id: `${customerId}-b` },
		});
		expect(rejected.allowed).toBe(false);
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			remaining: 96,
			usage: 4,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 4,
			limit: 5,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("usage-window-lock2: finalize at the lock value leaves the counter unchanged")}`,
	async () => {
		const freePlan = products.base({
			id: "uw-check-confirm",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = "uw-check-confirm-1";
		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freePlan] }),
			],
			actions: [s.billing.attach({ productId: freePlan.id })],
		});
		await deleteLock({ ctx, lockId: customerId });

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			limit: 5,
		});

		await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 3,
			lock: { enabled: true, lock_id: customerId },
		});

		await autumnV2_3.balances.finalize({
			lock_id: customerId,
			action: "confirm",
		});

		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			remaining: 97,
			usage: 3,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 3,
			limit: 5,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("usage-window-lock3: finalize below the lock value frees window headroom")}`,
	async () => {
		const freePlan = products.base({
			id: "uw-check-unwind",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = "uw-check-unwind-1";
		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freePlan] }),
			],
			actions: [s.billing.attach({ productId: freePlan.id })],
		});
		await deleteLock({ ctx, lockId: customerId });

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			limit: 5,
		});

		await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 4,
			lock: { enabled: true, lock_id: customerId },
		});
		await autumnV2_3.balances.finalize({
			lock_id: customerId,
			action: "confirm",
			override_value: 1,
		});

		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			remaining: 99,
			usage: 1,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 1,
			limit: 5,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 5,
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			remaining: 95,
			usage: 5,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 5,
			limit: 5,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("usage-window-lock4: finalize above the lock value is refused past the window limit")}`,
	async () => {
		const freePlan = products.base({
			id: "uw-lock-overfinal",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = "uw-lock-overfinal-1";
		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freePlan] }),
			],
			actions: [s.billing.attach({ productId: freePlan.id })],
		});
		await deleteLock({ ctx, lockId: customerId });

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			limit: 5,
		});

		const granted = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 3,
			lock: { enabled: true, lock_id: customerId },
		});
		expect(granted.allowed).toBe(true);

		await expectAutumnError({
			errCode: ErrCode.InsufficientBalance,
			func: () =>
				autumnV2_3.balances.finalize({
					lock_id: customerId,
					action: "confirm",
					override_value: 6,
				}),
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			remaining: 97,
			usage: 3,
		});

		await autumnV2_3.balances.finalize({
			lock_id: customerId,
			action: "confirm",
			override_value: 5,
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			remaining: 95,
			usage: 5,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 5,
			limit: 5,
		});
	},
);
