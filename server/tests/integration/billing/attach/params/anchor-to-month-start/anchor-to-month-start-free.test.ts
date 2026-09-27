/**
 * Free plans with `config.anchor_to_month_start` reset on the 1st of the month (00:00 UTC).
 *
 * Contract:
 *   default plan attached at customer creation → next_reset_at = next 1st
 *   free plan attached                          → next_reset_at = next 1st
 *   free (flag off) → free (flagged)            → next_reset_at moves to the next 1st
 */

import { test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	anchoredToMonthStart,
	nextMonthStartMs,
} from "./utils/anchorToMonthStartUtils";

const EXACT_MS = 1000;

test.concurrent(
	`${chalk.yellowBright("anchor-to-month-start free 1: default plan at customer creation resets on the 1st")}`,
	async () => {
		const customerId = "anchor-month-free-default";
		const free = anchoredToMonthStart(
			products.base({
				id: "free",
				isDefault: true,
				items: [items.monthlyMessages({ includedUsage: 100 })],
			}),
		);

		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.products({ list: [free] }),
				s.customer({ testClock: false, withDefault: true }),
			],
			actions: [],
		});

		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.Messages,
			remaining: 100,
			planId: free.id,
			nextResetAt: nextMonthStartMs({ fromMs: Date.now() }),
			toleranceMs: EXACT_MS,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("anchor-to-month-start free 2: attaching a flagged free plan resets on the 1st")}`,
	async () => {
		const customerId = "anchor-month-free-attach";
		const free = anchoredToMonthStart(
			products.base({
				id: "free",
				items: [items.monthlyMessages({ includedUsage: 100 })],
			}),
		);

		const { autumnV2_3, advancedTo } = await initScenario({
			customerId,
			setup: [s.customer({}), s.products({ list: [free] })],
			actions: [s.billing.attach({ productId: free.id })],
		});

		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.Messages,
			remaining: 100,
			planId: free.id,
			nextResetAt: nextMonthStartMs({ fromMs: advancedTo }),
			toleranceMs: EXACT_MS,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("anchor-to-month-start free 3: free -> flagged free re-anchors resets to the 1st")}`,
	async () => {
		const customerId = "anchor-month-free-to-free";
		const freeUnanchored = products.base({
			id: "free-unanchored",
			items: [items.monthlyMessages({ includedUsage: 50 })],
		});
		const freeAnchored = anchoredToMonthStart(
			products.base({
				id: "free-anchored",
				items: [items.monthlyMessages({ includedUsage: 100 })],
			}),
		);

		const { autumnV2_3, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({}),
				s.products({ list: [freeUnanchored, freeAnchored] }),
			],
			actions: [
				s.billing.attach({ productId: freeUnanchored.id }),
				s.advanceTestClock({ days: 3 }),
			],
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: freeAnchored.id,
		});

		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.Messages,
			remaining: 100,
			planId: freeAnchored.id,
			nextResetAt: nextMonthStartMs({ fromMs: advancedTo }),
			toleranceMs: EXACT_MS,
		});
	},
);
