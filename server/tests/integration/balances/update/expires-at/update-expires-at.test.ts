import { expect, test } from "bun:test";
import { type CheckResponseV2, ms, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("update-expires-at-1: set expires_at via raw cus_ent_ id")}`,
	async () => {
		const customerId = "update-expires-at-1";
		const { autumnV2 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		await autumnV2.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			included_grant: 100,
		});

		const initialCheck = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		expect(initialCheck.balance?.breakdown).toHaveLength(1);
		const cusEntId = initialCheck.balance?.breakdown?.[0].id ?? "";
		expect(cusEntId.startsWith("cus_ent")).toBe(true);
		expect(initialCheck.balance?.breakdown?.[0].expires_at ?? null).toBeNull();

		const expiresAt = Date.now() + ms.days(30);
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			balance_id: cusEntId,
			expires_at: expiresAt,
		});

		const check = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		expect(check.balance?.breakdown?.[0].expires_at).toBeCloseTo(expiresAt, -3);

		expect(check.balance?.breakdown?.[0].current_balance).toBe(100);

		const checkFromDb = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});
		expect(checkFromDb.balance?.breakdown?.[0].expires_at).toBeCloseTo(
			expiresAt,
			-3,
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("update-expires-at-2: set expires_at via external balance_id from create")}`,
	async () => {
		const customerId = "update-expires-at-2";
		const externalBalanceId = "invite-credits";

		const { autumnV2 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		await autumnV2.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			included_grant: 250,
			balance_id: externalBalanceId,
		});

		const initialCheck = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		const created = initialCheck.balance?.breakdown?.find(
			(b) => b.id === externalBalanceId,
		);
		expect(created).toBeTruthy();
		expect(created?.expires_at ?? null).toBeNull();

		const expiresAt = Date.now() + ms.days(7);
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			balance_id: externalBalanceId,
			expires_at: expiresAt,
		});

		const check = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		const updated = check.balance?.breakdown?.find(
			(b) => b.id === externalBalanceId,
		);
		expect(updated?.expires_at).toBeCloseTo(expiresAt, -3);
		expect(updated?.current_balance).toBe(250);

		const checkFromDb = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});
		const updatedDb = checkFromDb.balance?.breakdown?.find(
			(b) => b.id === externalBalanceId,
		);
		expect(updatedDb?.expires_at).toBeCloseTo(expiresAt, -3);
	},
);

test.concurrent(
	`${chalk.yellowBright("update-expires-at-3: past expires_at is rejected")}`,
	async () => {
		const customerId = "update-expires-at-3";
		const { autumnV2 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		await autumnV2.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			included_grant: 100,
			balance_id: "past-expiry",
		});

		await expectAutumnError({
			func: async () => {
				await autumnV2.balances.update({
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					balance_id: "past-expiry",
					expires_at: Date.now() - ms.days(1),
				});
			},
		});

		const check = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		const balance = check.balance?.breakdown?.find(
			(b) => b.id === "past-expiry",
		);
		expect(balance?.current_balance).toBe(100);
		expect(balance?.expires_at ?? null).toBeNull();
	},
);

test.concurrent(
	`${chalk.yellowBright("update-expires-at-4: expires_at allowed on free recurring balance")}`,
	async () => {
		const customerId = "update-expires-at-4";
		const monthlyProd = products.base({
			id: "free-monthly",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [monthlyProd] }),
			],
			actions: [s.attach({ productId: monthlyProd.id })],
		});

		const expiresAt = Date.now() + ms.days(180);
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			expires_at: expiresAt,
		});

		const check = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		expect(check.balance?.breakdown?.[0].expires_at).toBeCloseTo(expiresAt, -3);
		expect(check.balance?.breakdown?.[0].current_balance).toBe(100);
		expect(check.balance?.breakdown?.[0].reset?.interval).toBe(
			ResetInterval.Month,
		);

		const checkFromDb = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});
		expect(checkFromDb.balance?.breakdown?.[0].expires_at).toBeCloseTo(
			expiresAt,
			-3,
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("update-expires-at-6: expires_at rejected on paid recurring balance")}`,
	async () => {
		const customerId = "update-expires-at-6";
		const freeProd = products.base({
			id: "free-base",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const prepaidProd = products.base({
			id: "prepaid-addon",
			items: [
				items.prepaidMessages({ includedUsage: 0, price: 1, billingUnits: 1 }),
			],
			isAddOn: true,
		});

		const { autumnV2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [freeProd, prepaidProd] }),
			],
			actions: [
				s.attach({ productId: freeProd.id }),
				s.attach({
					productId: prepaidProd.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
				}),
			],
		});

		await new Promise((resolve) => setTimeout(resolve, 3000));

		const initialCheck = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		const prepaidBreakdown = initialCheck.balance?.breakdown?.find(
			(b) => (b.purchased_balance ?? 0) > 0,
		);
		expect(prepaidBreakdown).toBeTruthy();
		const prepaidCusEntId = prepaidBreakdown?.id ?? "";

		await expectAutumnError({
			func: async () => {
				await autumnV2.balances.update({
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					balance_id: prepaidCusEntId,
					expires_at: Date.now() + ms.days(30),
				});
			},
		});

		const check = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		const prepaidAfter = check.balance?.breakdown?.find(
			(b) => b.id === prepaidCusEntId,
		);
		expect(prepaidAfter?.expires_at ?? null).toBeNull();
	},
);

test.concurrent(
	`${chalk.yellowBright("update-expires-at-5: expire a one-off top-up alongside a recurring grant")}`,
	async () => {
		const customerId = "update-expires-at-5";
		const plan = products.base({
			id: "recurring-plan",
			items: [items.monthlyMessages({ includedUsage: 800 })],
		});

		const { autumnV2 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [s.attach({ productId: plan.id })],
		});

		const topUpBalanceId = "topup";
		await autumnV2.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			included_grant: 5000,
			balance_id: topUpBalanceId,
		});

		const initialCheck = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		expect(initialCheck.balance?.breakdown?.length).toBeGreaterThanOrEqual(2);

		const oneOffBreakdown = initialCheck.balance?.breakdown?.find(
			(b) => b.id === topUpBalanceId,
		);
		expect(oneOffBreakdown).toBeTruthy();
		expect(oneOffBreakdown?.reset?.interval ?? ResetInterval.OneOff).toBe(
			ResetInterval.OneOff,
		);

		const expiresAt = Date.now() + ms.days(30);
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			balance_id: topUpBalanceId,
			expires_at: expiresAt,
		});

		const check = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		const topUpAfter = check.balance?.breakdown?.find(
			(b) => b.id === topUpBalanceId,
		);
		expect(topUpAfter?.expires_at).toBeCloseTo(expiresAt, -3);

		const monthlyBreakdown = check.balance?.breakdown?.find(
			(b) => b.reset?.interval === ResetInterval.Month,
		);
		expect(monthlyBreakdown?.expires_at ?? null).toBeNull();
	},
);
