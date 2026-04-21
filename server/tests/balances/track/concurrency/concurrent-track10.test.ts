import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";

// ─────────────────────────────────────────────────────────────────────────────
// Sustained-rate track test.
//
// Instead of blasting everything at once (like track6), this sends tracks
// at a steady rate over multiple seconds — exercising the sync batching
// window and cross-window dedup behavior. Verifies that the final cached
// + DB balances are correct.
//
// 100 tracks/s × 10s = 1000 total, each with a random decimal value.
// ─────────────────────────────────────────────────────────────────────────────

const INCLUDED_USAGE = 50_000;
const RATE_PER_SECOND = 100;
const DURATION_SECONDS = 10;
const TOTAL_TRACKS = RATE_PER_SECOND * DURATION_SECONDS;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test(
	`${chalk.yellowBright(`concurrentTrack10: sustained-rate track (${RATE_PER_SECOND}/s for ${DURATION_SECONDS}s) — cache + DB correct`)}`,
	async () => {
		const messagesItem = items.monthlyMessages({
			includedUsage: INCLUDED_USAGE,
		});
		const freeProd = products.base({
			id: "free",
			items: [messagesItem],
		});

		const { customerId, autumnV1 } = await initScenario({
			customerId: "concurrentTrack10",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		// Verify initial balance
		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customerBefore.features[TestFeature.Messages].balance).toBe(
			INCLUDED_USAGE,
		);

		// Fire tracks at a steady rate: RATE_PER_SECOND per second for DURATION_SECONDS
		let expectedUsage = new Decimal(0);
		const allPromises: Promise<unknown>[] = [];
		const startTime = Date.now();

		for (let sec = 0; sec < DURATION_SECONDS; sec++) {
			for (let i = 0; i < RATE_PER_SECOND; i++) {
				const value = new Decimal(Math.random() * 2 + 0.1)
					.toDecimalPlaces(4)
					.toNumber();
				expectedUsage = expectedUsage.plus(value);

				allPromises.push(
					autumnV1.track({
						customer_id: customerId,
						feature_id: TestFeature.Messages,
						value,
						skip_event: true,
					}),
				);
			}

			if (sec < DURATION_SECONDS - 1) {
				await wait(1000);
			}
		}

		await Promise.all(allPromises);

		console.log(
			`[concurrentTrack10] Sent ${TOTAL_TRACKS} tracks in ${Date.now() - startTime}ms`,
		);

		// Verify cached balance
		const customerCached =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		const expectedBalance = Decimal.max(
			0,
			new Decimal(INCLUDED_USAGE).minus(expectedUsage),
		)
			.toDP(5)
			.toNumber();

		const cappedUsage = Decimal.min(expectedUsage, INCLUDED_USAGE)
			.toDP(5)
			.toNumber();

		expect(
			new Decimal(customerCached.features[TestFeature.Messages].balance ?? 0)
				.toDP(5)
				.toNumber(),
		).toEqual(expectedBalance);

		expect(
			new Decimal(customerCached.features[TestFeature.Messages].usage ?? 0)
				.toDP(5)
				.toNumber(),
		).toEqual(cappedUsage);

		// Wait for sync to flush to Postgres
		await timeout(8000);

		// Verify DB balance matches
		const customerDb = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
			skip_cache: "true",
		});

		expect(
			new Decimal(customerDb.features[TestFeature.Messages].balance ?? 0)
				.toDP(5)
				.toNumber(),
		).toEqual(expectedBalance);

		expect(
			new Decimal(customerDb.features[TestFeature.Messages].usage ?? 0)
				.toDP(5)
				.toNumber(),
		).toEqual(cappedUsage);
	},
	{ timeout: 60_000 },
);
