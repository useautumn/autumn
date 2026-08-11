/**
 * TDD test for granted-balance-only entitlements being unrefundable via track.
 *
 * A cusEnt whose balance came purely from a manual grant (add_to_balance)
 * has entitlement.allowance = 0, and the grant used to bump `balance` only,
 * so the refund ceiling (startingBalance + adjustment) stayed at 0 and any
 * negative track above it was silently swallowed with a 200.
 *
 * Red-failure mode (current behavior):
 *  - add_to_balance 5, track +2 (balance 3), track -2 → balance stays 3,
 *    no error, HTTP 200.
 *
 * Green-success criteria (after fix):
 *  - add_to_balance records the grant in `adjustment`, so the negative track
 *    restores the balance to 5, and refunds still clamp at the granted level
 *    (allowance + adjustment) — never above it.
 */

import { expect, test } from "bun:test";
import type { ApiCustomer, TrackResponseV2 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════
// TRACK-NEGATIVE-GRANT1: refund after add_to_balance grant restores balance
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("track-negative-grant1: negative track restores balance granted via add_to_balance")}`,
	async () => {
		const messagesItem = items.monthlyMessages({ includedUsage: 0 });
		const freeProd = products.base({ id: "free", items: [messagesItem] });

		const { customerId, autumnV2 } = await initScenario({
			customerId: "track-negative-grant1",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd], createInStripe: false }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		// Grant 5 via add_to_balance (allowance is 0)
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			add_to_balance: 5,
		});

		// The grant is recorded in the granted level, not as negative usage
		const customerAfterGrant =
			await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(customerAfterGrant.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 5,
			current_balance: 5,
			usage: 0,
		});

		// Track usage — works, balance goes down
		const trackRes1: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 2,
		});
		expect(trackRes1.balance).toMatchObject({
			granted_balance: 5,
			current_balance: 3,
			usage: 2,
		});

		// Refund the usage — must restore the balance to the granted level
		const trackRes2: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: -2,
		});
		expect(trackRes2.balance).toMatchObject({
			granted_balance: 5,
			current_balance: 5,
			usage: 0,
		});

		// Refunds must still clamp at the granted level, never inflate above it
		const trackRes3: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: -100,
		});
		expect(trackRes3.balance).toMatchObject({
			granted_balance: 5,
			current_balance: 5,
			usage: 0,
		});

		await timeout(2000);
		const customerDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
			skip_cache: "true",
		});
		expect(customerDb.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 5,
			current_balance: 5,
			usage: 0,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════
// TRACK-NEGATIVE-GRANT2: allowance-backed refund clamps at allowance + grant
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("track-negative-grant2: refund clamps at allowance plus add_to_balance grant")}`,
	async () => {
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const freeProd = products.base({ id: "free", items: [messagesItem] });

		const { customerId, autumnV2 } = await initScenario({
			customerId: "track-negative-grant2",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd], createInStripe: false }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		// Grant 5 on top of the allowance
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			add_to_balance: 5,
		});

		const trackRes1: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
		});
		expect(trackRes1.balance).toMatchObject({
			granted_balance: 105,
			current_balance: 95,
			usage: 10,
		});

		// Over-refund: must clamp at the granted level (100 + 5), not inflate
		const trackRes2: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: -20,
		});
		expect(trackRes2.balance).toMatchObject({
			granted_balance: 105,
			current_balance: 105,
			usage: 0,
		});

		await timeout(2000);
		const customerDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
			skip_cache: "true",
		});
		expect(customerDb.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 105,
			current_balance: 105,
			usage: 0,
		});
	},
);
