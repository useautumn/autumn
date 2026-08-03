/**
 * Contract: how a run resolves webhook delivery.
 *
 *   - `sendWebhooks` omitted → ON at/below the auto-disable threshold,
 *     OFF above it (bulk runs must be opted in);
 *   - explicit `sendWebhooks` always wins over the count;
 *   - concurrency defaults to DEFAULT and is clamped to [1, MAX].
 *
 * Subscription gating and dry-run behaviour live in the integration test —
 * they need a real ctx.
 */

import { describe, expect, test } from "bun:test";
import {
	DEFAULT_MIGRATION_WEBHOOK_CONCURRENCY,
	MAX_MIGRATION_WEBHOOK_CONCURRENCY,
	MIGRATION_WEBHOOK_AUTO_DISABLE_THRESHOLD,
	resolveMigrationWebhookDelivery,
} from "@/internal/migrations/v2/webhookDelivery/webhookDeliveryConstants.js";

describe("resolveMigrationWebhookDelivery", () => {
	test("defaults on at the threshold and off above it", () => {
		expect(
			resolveMigrationWebhookDelivery({
				matchedCustomerCount: MIGRATION_WEBHOOK_AUTO_DISABLE_THRESHOLD,
			}).sendWebhooks,
		).toBe(true);

		expect(
			resolveMigrationWebhookDelivery({
				matchedCustomerCount: MIGRATION_WEBHOOK_AUTO_DISABLE_THRESHOLD + 1,
			}).sendWebhooks,
		).toBe(false);
	});

	test("an explicit choice overrides the count in both directions", () => {
		expect(
			resolveMigrationWebhookDelivery({
				sendWebhooks: true,
				matchedCustomerCount: MIGRATION_WEBHOOK_AUTO_DISABLE_THRESHOLD * 10,
			}).sendWebhooks,
		).toBe(true);

		expect(
			resolveMigrationWebhookDelivery({
				sendWebhooks: false,
				matchedCustomerCount: 1,
			}).sendWebhooks,
		).toBe(false);
	});

	test("concurrency defaults and clamps to the supported range", () => {
		expect(
			resolveMigrationWebhookDelivery({ matchedCustomerCount: 1 })
				.webhookConcurrency,
		).toBe(DEFAULT_MIGRATION_WEBHOOK_CONCURRENCY);

		expect(
			resolveMigrationWebhookDelivery({
				matchedCustomerCount: 1,
				webhookConcurrency: MAX_MIGRATION_WEBHOOK_CONCURRENCY + 500,
			}).webhookConcurrency,
		).toBe(MAX_MIGRATION_WEBHOOK_CONCURRENCY);

		expect(
			resolveMigrationWebhookDelivery({
				matchedCustomerCount: 1,
				webhookConcurrency: 0,
			}).webhookConcurrency,
		).toBe(1);
	});
});
