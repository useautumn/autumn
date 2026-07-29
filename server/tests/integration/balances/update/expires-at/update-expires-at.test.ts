/**
 * TDD test for `expires_at` on the `balances.update` endpoint
 * (POST /v1/balances/update and /v1/balances.update -> handleUpdateBalance).
 *
 * Contract under test:
 *   New types/fields:
 *     - expires_at?: number on UpdateBalanceParamsV0Schema — Unix ms timestamp
 *       when the targeted balance expires.
 *   New behaviors:
 *     - balances.update({ balance_id: <raw cus_ent_ id>, expires_at }) sets
 *       expires_at on the cusEnt addressed by its internal id (balance_id
 *       fallback: external_id ?? cusEnt.id).
 *     - balances.update({ balance_id: <external id from create>, expires_at })
 *       sets expires_at on the cusEnt addressed by the caller-chosen external id.
 *   Validation:
 *     - a non-future expires_at (<= now) is rejected, since it would instantly
 *       filter the balance out of the customer's active entitlements.
 *     - expires_at is allowed on free grants (recurring or one-off) and one-off
 *       prepaid top-ups; it is rejected only on paid recurring balances, whose
 *       lifetime follows the billing cycle.
 *   Side effects:
 *     - customer_entitlements.expires_at updated for the targeted row; the
 *       change is visible via check.balance.breakdown[n].expires_at on both the
 *       cached and skip_cache read paths.
 *
 * Pre-impl red: every assertion fails because the schema has no expires_at
 * field, so the update is a no-op and breakdown.expires_at stays null.
 * Post-impl green: expires_at is persisted and surfaced on the breakdown.
 */

import { expect, test } from "bun:test";
import { type CheckResponseV2, ms, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════
// UPDATE-EXPIRES-AT-1: target a loose balance by its raw cus_ent_ id
// A balance created without a balance_id is addressable by its internal
// cusEnt id (breakdown[n].id = cus_ent_... when no external_id is set).
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("update-expires-at-1: set expires_at via raw cus_ent_ id")}`,
	async () => {
		const customerId = "update-expires-at-1";
		const { autumnV2 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		// Loose balance, no balance_id → breakdown id is the raw cusEnt id.
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
		// Raw internal id (no external_id was set at create time).
		expect(cusEntId.startsWith("cus_ent")).toBe(true);
		expect(initialCheck.balance?.breakdown?.[0].expires_at ?? null).toBeNull();

		const expiresAt = Date.now() + ms.days(30);
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			balance_id: cusEntId,
			expires_at: expiresAt,
		});

		// Cached read reflects the new expiry.
		const check = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		expect(check.balance?.breakdown?.[0].expires_at).toBeCloseTo(expiresAt, -3);

		// Balance itself is untouched.
		expect(check.balance?.breakdown?.[0].current_balance).toBe(100);

		// DB sync (skip_cache) agrees.
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

// ═══════════════════════════════════════════════════════════════════
// UPDATE-EXPIRES-AT-2: target a balance by its external id (set on create)
// balances.create({ balance_id }) stores the caller-chosen id as external_id;
// balances.update({ balance_id }) addresses that same balance to set expiry.
// ═══════════════════════════════════════════════════════════════════

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

		// DB sync (skip_cache) agrees.
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

// ═══════════════════════════════════════════════════════════════════
// UPDATE-EXPIRES-AT-3: a past expires_at is rejected
// A non-future expiry would immediately filter the balance out of the
// customer's active entitlements, so it is refused.
// ═══════════════════════════════════════════════════════════════════

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

		// Balance is untouched and still visible (not expired).
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

// ═══════════════════════════════════════════════════════════════════
// UPDATE-EXPIRES-AT-4: expires_at IS allowed on a FREE recurring balance
// e.g. "100 credits/month for 6 months" — the reset cron keeps refilling
// the grant each cycle until the expiry date filters it out.
// ═══════════════════════════════════════════════════════════════════

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
		// Expiry is set, and the balance still recurs (untouched) until then.
		expect(check.balance?.breakdown?.[0].expires_at).toBeCloseTo(expiresAt, -3);
		expect(check.balance?.breakdown?.[0].current_balance).toBe(100);
		expect(check.balance?.breakdown?.[0].reset?.interval).toBe(
			ResetInterval.Month,
		);

		// DB sync (skip_cache) agrees.
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

// ═══════════════════════════════════════════════════════════════════
// UPDATE-EXPIRES-AT-6: expires_at is rejected on a PAID recurring balance
// A prepaid (purchased) recurring balance's lifetime follows the billing
// cycle, so it cannot be given an ad-hoc expiry.
// ═══════════════════════════════════════════════════════════════════

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

		// Wait for Stripe webhooks.
		await new Promise((resolve) => setTimeout(resolve, 3000));

		const initialCheck = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		// The paid (prepaid) breakdown is the one carrying purchased balance.
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

// ═══════════════════════════════════════════════════════════════════
// UPDATE-EXPIRES-AT-5: expire a one-off top-up while a recurring plan grant
// on the SAME feature stays untouched.
// ═══════════════════════════════════════════════════════════════════

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

		// The recurring grant is unaffected and cannot itself be expired.
		const monthlyBreakdown = check.balance?.breakdown?.find(
			(b) => b.reset?.interval === ResetInterval.Month,
		);
		expect(monthlyBreakdown?.expires_at ?? null).toBeNull();
	},
);
