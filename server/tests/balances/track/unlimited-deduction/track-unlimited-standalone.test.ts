/**
 * Unlimited cusEnts become an infinite sink that REALLY deducts.
 *
 * Contract:
 *   New behavior: tracking usage on a feature whose cusEnt is unlimited no
 *     longer short-circuits (the `unlimitedFeatureIds` skip in
 *     executeRedisDeductionV2.ts). The deduction really runs:
 *     raw `customer_entitlements.balance` -= tracked value, absorbed with no
 *     floor, so the balance drifts negative as a usage counter and the track
 *     request always succeeds.
 *   Latest API (V2_3): unlimited balances now surface real usage —
 *     `usage = -(raw balance)` while `granted`/`remaining` stay 0 and
 *     `unlimited: true`. Older API versions stay fully masked.
 *
 * Red (current): the skip means no deduction anywhere — raw DB balance stays
 *   0 after tracking, so the -5 / -8 assertions fail with `Expected: -5,
 *   Received: 0`, and V2_3 responses still mask usage to 0.
 * Green (after): track 5 → raw balance -5; track 3 more → -8; V2_3
 *   check/customer report usage 8 with granted/remaining 0.
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV5,
	CheckResponseV3,
	TrackResponseV3,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { pollRawCusEntBalance } from "./unlimitedDeductionTestUtils.js";

test.concurrent(
	`${chalk.yellowBright("track-unlimited-standalone: track on unlimited feature really deducts raw balance, API stays masked")}`,
	async () => {
		const customerId = "track-unlim-standalone";

		const unlimitedProd = products.base({
			id: "unlimited",
			items: [items.unlimitedMessages()],
		});

		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [unlimitedProd] }),
			],
			actions: [s.attach({ productId: unlimitedProd.id })],
		});

		const customer = (await autumnV2_3.customers.get(customerId, {
			with_autumn_id: true,
		})) as ApiCustomerV5 & { autumn_id?: string };
		const internalCustomerId = customer.autumn_id;
		expect(internalCustomerId).toBeDefined();

		// ---- Track 5: request succeeds and the response stays masked --------
		const track1 = (await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 5,
		})) as TrackResponseV3;

		expect(track1.customer_id).toBe(customerId);
		expect(track1.value).toBe(5);
		expect(track1.balance?.unlimited).toBe(true);

		// ---- Raw DB balance really moved: 0 - 5 = -5 ------------------------
		const rowAfter5 = await pollRawCusEntBalance({
			internalCustomerId: internalCustomerId as string,
			featureId: TestFeature.Messages,
			expectedBalance: -5,
		});
		expect(rowAfter5?.unlimited).toBe(true);
		expect(rowAfter5?.balance).toBe(-5);

		// ---- A second track accumulates: -5 - 3 = -8 ------------------------
		const track2 = (await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 3,
		})) as TrackResponseV3;
		expect(track2.value).toBe(3);

		const rowAfter8 = await pollRawCusEntBalance({
			internalCustomerId: internalCustomerId as string,
			featureId: TestFeature.Messages,
			expectedBalance: -8,
		});
		expect(rowAfter8?.balance).toBe(-8);

		// ---- Latest API surfaces real usage (granted/remaining stay 0) ------
		const checkRes = (await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 999_999,
		})) as unknown as CheckResponseV3;
		expect(checkRes.allowed).toBe(true);
		expect(checkRes.balance?.unlimited).toBe(true);
		expect(checkRes.balance?.remaining).toBe(0);
		expect(checkRes.balance?.usage).toBe(8);

		const customerAfter =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		const messagesBalance = customerAfter.balances[TestFeature.Messages];
		expect(messagesBalance?.unlimited).toBe(true);
		expect(messagesBalance?.remaining).toBe(0);
		expect(messagesBalance?.usage).toBe(8);
	},
	{ timeout: 90_000 },
);
