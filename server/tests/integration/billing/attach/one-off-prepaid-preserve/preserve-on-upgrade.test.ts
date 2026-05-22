/**
 * TDD test for auto-preservation of one-off prepaid balances on attach transitions.
 *
 * Contract under test:
 *   New behaviors:
 *     - When attach expires a customer product that holds a one-off prepaid
 *       customer_entitlement with balance > 0, those credits are auto-preserved
 *       as a lifetime customer_entitlement on the new product (no opt-in flag).
 *   Skip conditions:
 *     - balance <= 0 → no carryover (silent no-op).
 *     - recurring prepaid (not one-off) → existing flows already handle; no carryover here.
 *     - boolean / unlimited / allocated cusEnt → skipped.
 *   Preserve even when the new product has no entitlement for the feature.
 *   Side effects (observable):
 *     - customer.features[messages].balance reflects the preserved units.
 *     - Upgrade invoice charges only the new plan, NOT the preserved units.
 *
 * Pre-impl red: every assertion fails because the outgoing product's cusEnt is
 *   orphaned today (no auto carryover for one-off prepaid).
 * Post-impl green: a new helper (handleCarryOvers/cusProductToOneOffPrepaidCarryOvers.ts)
 *   is called from computeAttachPlan and emits the lifetime cusEnt rows.
 */

import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Immediate upgrade preserves remaining one-off prepaid balance as lifetime.
//
//    Pro (one-off-prepaid messages, 200 purchased → 50 used → balance 150)
//      ──upgrade──▶ Premium (recurring messages, 500 included)
//    Expected: customer.features.messages.balance = 500 + 150 = 650
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("one-off-preserve attach 1: upgrade pro+one-off-prepaid → premium preserves remaining balance as lifetime cusEnt")}`,
	async () => {
		const customerId = "one-off-preserve-attach-upgrade";

		const proOneOff = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const pro = products.pro({ id: "pro", items: [proOneOff] });

		const premiumMessages = items.monthlyMessages({ includedUsage: 500 });
		const premium = products.premium({
			id: "premium",
			items: [premiumMessages],
		});

		const { autumnV1, autumnV2_1, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
				}),
			],
		});

		// Burn 50 of the 200 → balance 150 on pro's one-off cusEnt.
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 50,
		});
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// ── act: immediate upgrade to premium (no carry_over_balances flag).
		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: premium.id,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// ── Contract assertion 1: balance preserved as lifetime carryover.
		// Pre-fix: balance = 500 (premium only, 150 dropped).
		// Post-fix: balance = 500 + 150 = 650.
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 650,
			usage: 0,
		});

		// ── Contract assertion 2: upgrade invoice charges only premium base
		//   (no extra charge for the preserved 150 units).
		await expectCustomerInvoiceCorrect({
			customer,
			count: 2,
		});
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. New paid product has NO entitlement for the feature — preserve anyway.
//
//    Pro (one-off-prepaid messages, balance 150)
//      ──upgrade──▶ Premium (no messages item, just dashboard)
//    Expected: customer.features.messages.balance = 150 (preserved as lifetime)
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("one-off-preserve attach 2: preserves balance even when new product has no entitlement for the feature")}`,
	async () => {
		const customerId = "one-off-preserve-attach-no-feature";

		const proOneOff = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const pro = products.pro({ id: "pro-nomsgs", items: [proOneOff] });

		// Premium variant with no messages entitlement — dashboard only.
		const premiumNoMessages = products.premium({
			id: "premium-nomsgs",
			items: [items.dashboard()],
		});

		const { autumnV1, autumnV2_1, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premiumNoMessages] }),
			],
			actions: [
				s.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
				}),
			],
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 50,
		});
		await new Promise((resolve) => setTimeout(resolve, 2000));

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: premiumNoMessages.id,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// ── Contract assertion: 150 units remain spendable even though
		//   the new product defines no messages entitlement.
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 150,
			usage: 0,
		});
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. Zero balance — no lifetime cusEnt created (silent no-op).
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("one-off-preserve attach 3: zero balance on one-off prepaid is a silent no-op")}`,
	async () => {
		const customerId = "one-off-preserve-attach-zero";

		const proOneOff = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const pro = products.pro({ id: "pro-zero", items: [proOneOff] });

		const premiumMessages = items.monthlyMessages({ includedUsage: 500 });
		const premium = products.premium({
			id: "premium-zero",
			items: [premiumMessages],
		});

		const { autumnV1, autumnV2_1, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				}),
			],
		});

		// Burn the whole pack.
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 100,
		});
		await new Promise((resolve) => setTimeout(resolve, 2000));

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: premium.id,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// ── Premium's 500 only — no lifetime cusEnt minted for a 0 balance.
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 500,
			usage: 0,
		});
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// 4. Mixed monthly + one-off prepaid on the SAME feature.
//
//    Pro hosts both:
//      - monthly cusEnt: 100 included (resets each cycle)
//      - one-off prepaid cusEnt: 200 purchased (lifetime balance)
//    Customer tracks 150 → monthly drains first (interval-sorted), so:
//      monthly cusEnt balance → 0, one-off cusEnt balance → 150
//    Upgrade to premium with a 1000-monthly entitlement.
//    Expected: monthly cusEnt's usage does NOT carry on attach (carry_from_previous
//    is false for Single usage features by default), so monthly = 1000.
//    The one-off cusEnt's remaining 150 carries as a lifetime cusEnt.
//    Total: 1000 + 150 = 1150.
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("one-off-preserve attach 4: mixed monthly + one-off prepaid only preserves the one-off cusEnt's remaining balance")}`,
	async () => {
		const customerId = "one-off-preserve-attach-mixed";

		const proMonthly = items.monthlyMessages({ includedUsage: 100 });
		const proOneOff = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const pro = products.pro({
			id: "pro-mixed",
			items: [proMonthly, proOneOff],
		});

		const premiumMonthly = items.monthlyMessages({ includedUsage: 1000 });
		const premium = products.premium({
			id: "premium-mixed",
			items: [premiumMonthly],
		});

		const { autumnV1, autumnV2_1, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
				}),
			],
		});

		// Drain all 100 of monthly + 50 of one-off → monthly=0, one-off=150.
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 150,
		});
		await new Promise((resolve) => setTimeout(resolve, 2000));

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: premium.id,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// premium grants 1000 monthly; preserved one-off lifetime = 150 → 1150.
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 1150,
			usage: 0,
		});
	},
);
