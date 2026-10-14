import { expect, test } from "bun:test";
import { type CheckResponseV2, ResetInterval } from "@autumn/shared";
import { UTCDate } from "@date-fns/utc";
import { findCustomerEntitlement } from "@tests/balances/utils/findCustomerEntitlement.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expireCusEntForReset } from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { add } from "date-fns";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const checkBalance = async (autumn: AutumnInt, customerId: string) => {
	const res = (await autumn.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	})) as unknown as CheckResponseV2;
	return res.balance?.current_balance;
};

test.concurrent(
	`${chalk.yellowBright("create-balance next_reset_at: custom first period, reset re-anchors on boundary + interval")}`,
	async () => {
		const customerId = "create-balance-nra-happy";

		const { autumnV1, autumnV2, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		const customNextResetAt = Date.now() + 10 * DAY_MS;

		await autumnV1.post("/balances/create", {
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			included_grant: 50,
			reset: { interval: ResetInterval.Month },
			next_reset_at: customNextResetAt,
		});

		const t0Balance = await checkBalance(autumnV2, customerId);
		expect(t0Balance).toBe(50);

		const t0CusEnt = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(t0CusEnt).toBeDefined();
		expect(t0CusEnt!.next_reset_at).toBe(customNextResetAt);
		expect(t0CusEnt!.reset_cycle_anchor).toBe(customNextResetAt);

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
		});
		await new Promise((resolve) => setTimeout(resolve, 2000));

		const t1Balance = await checkBalance(autumnV2, customerId);
		expect(t1Balance).toBe(40);

		const t1CusEnt = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(t1CusEnt!.next_reset_at).toBe(customNextResetAt);

		const pastBoundary = Date.now() - 5 * DAY_MS;
		await expireCusEntForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			pastTimeMs: pastBoundary,
		});

		const t5Balance = await checkBalance(autumnV2, customerId);
		expect(t5Balance).toBe(50);

		const t5CusEnt = await pollUntilAsserted({
			fetch: () =>
				findCustomerEntitlement({
					ctx,
					customerId,
					featureId: TestFeature.Messages,
				}),
			assert: (cusEnt) =>
				expect(cusEnt!.next_reset_at).toBeGreaterThan(Date.now()),
		});

		const expectedNext = add(new UTCDate(pastBoundary), {
			months: 1,
		}).getTime();
		expect(Math.abs(t5CusEnt!.next_reset_at! - expectedNext)).toBeLessThan(
			DAY_MS,
		);
		const nowPlusInterval = add(new UTCDate(), { months: 1 }).getTime();
		expect(t5CusEnt!.next_reset_at!).toBeLessThan(nowPlusInterval - 3 * DAY_MS);
	},
);

test.concurrent(
	`${chalk.yellowBright("create-balance next_reset_at: rejected without a reset interval")}`,
	async () => {
		const customerId = "create-balance-nra-no-reset";

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		await expect(
			autumnV1.post("/balances/create", {
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				included_grant: 50,
				next_reset_at: Date.now() + 10 * DAY_MS,
			}),
		).rejects.toThrow();
	},
);

test.concurrent(
	`${chalk.yellowBright("create-balance next_reset_at: rejected when in the past")}`,
	async () => {
		const customerId = "create-balance-nra-past";

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		await expect(
			autumnV1.post("/balances/create", {
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				included_grant: 50,
				reset: { interval: ResetInterval.Month },
				next_reset_at: Date.now() - 10 * DAY_MS,
			}),
		).rejects.toThrow();
	},
);

test.concurrent(
	`${chalk.yellowBright("create-balance next_reset_at: rejected when it occurs at/after expires_at")}`,
	async () => {
		const customerId = "create-balance-nra-after-expiry";

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		const nextResetAt = Date.now() + 20 * DAY_MS;
		const expiresAt = Date.now() + 10 * DAY_MS;

		await expect(
			autumnV1.post("/balances/create", {
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				included_grant: 50,
				reset: { interval: ResetInterval.Month },
				next_reset_at: nextResetAt,
				expires_at: expiresAt,
			}),
		).rejects.toThrow();
	},
);
