/**
 * End-to-end integration test for the edge config override of skip_overage_submission.
 *
 * Same scenario as skip-overage-submission.test.ts but instead of setting
 * skip_overage_submission: true on the org config, we set the customer ID
 * in the feature flag edge config's skipOverageSubmissionFlags.
 *
 * This test writes to S3 via updateFullFeatureFlagConfig, then waits for the
 * server's feature flag store to poll and pick up the change (10s interval).
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { FeatureFlagConfigSchema } from "@/internal/misc/featureFlags/featureFlagSchemas";
import {
	getFeatureFlagConfigFromSource,
	updateFullFeatureFlagConfig,
} from "@/internal/misc/featureFlags/featureFlagStore";

/**
 * Scenario:
 * - Pro ($20/mo) with consumable messages (100 included, $0.10/unit overage)
 * - Org config skip_overage_submission = false (default)
 * - Edge config skipOverageSubmissionFlags has this org + customer (written to S3)
 * - Track 200 messages (100 overage at $0.10 = $10 overage)
 * - Wait for server to poll updated config from S3
 * - Advance to next billing cycle
 *
 * Expected: Renewal invoice is $20 (base only, NO overage) because
 * the edge config override skips overage submission for this customer.
 * Usage balances are still reset.
 */
test.concurrent(`${chalk.yellowBright("skip overage submission - edge config override")}`, async () => {
	const customerId = "skip-overage-edge-config";

	const consumableMessagesItem = items.consumableMessages({
		includedUsage: 100,
	});

	const pro = products.pro({
		id: "pro",
		items: [consumableMessagesItem],
	});

	const { ctx, autumnV1, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Save the current feature flags config so we can restore it after the test
	let originalConfig = FeatureFlagConfigSchema.parse({});
	try {
		originalConfig = await getFeatureFlagConfigFromSource();
	} catch {
		// S3 may return NoSuchKey; use defaults
	}

	// Write to S3: skip overage for this specific customer
	// updateFullFeatureFlagConfig writes to S3 AND updates the calling
	// process's in-memory config. The server process will pick this up
	// on its next poll cycle (every 10s).
	await updateFullFeatureFlagConfig({
		config: {
			...originalConfig,
			skipOverageSubmissionFlags: {
				...originalConfig.skipOverageSubmissionFlags,
				[ctx.org.id]: [customerId],
			},
		},
	});

	// Wait for the server process to poll the updated config from S3
	// Server polls every 10s, so 15s gives a comfortable margin
	await timeout(15000);

	// Verify product is active
	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer: customerAfterAttach,
		productId: pro.id,
	});

	// Track 200 messages (100 included + 100 overage)
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 200,
	});

	await timeout(2000);

	// Advance to next billing cycle -- triggers invoice.created webhook
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		withPause: true,
	});

	// Verify: renewal invoice should be $20 base only (no $10 overage)
	const customerAfterRenewal =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerInvoiceCorrect({
		customer: customerAfterRenewal,
		count: 2,
		latestTotal: 20,
		latestInvoiceProductId: pro.id,
	});

	// Verify usage balances were reset
	expectCustomerFeatureCorrect({
		customer: customerAfterRenewal,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	expect(customerAfterRenewal.features[TestFeature.Messages].balance).toBe(100);

	// Clean up: restore original feature flags config in S3
	await updateFullFeatureFlagConfig({
		config: originalConfig,
	});
});
