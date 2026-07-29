/**
 * End-to-end integration test for the edge config override of overage billing.
 *
 * The edge config can disable Stripe overage line item creation for a specific
 * org/customer pair while usage balances still reset normally.
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

test(`${chalk.yellowBright("disable overage billing: edge config disables Stripe overage and resets")}`, async () => {
	const customerId = "disable-overage-edge-config";
	const pro = products.pro({
		id: "pro",
		items: [items.consumableMessages({ includedUsage: 100 })],
	});

	const { ctx, autumnV1, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	let originalConfig = FeatureFlagConfigSchema.parse({});
	try {
		originalConfig = await getFeatureFlagConfigFromSource();
	} catch {
		// S3 may return NoSuchKey; use defaults.
	}

	try {
		await updateFullFeatureFlagConfig({
			config: {
				...originalConfig,
				disableOverageBillingFlags: {
					...originalConfig.disableOverageBillingFlags,
					[ctx.org.id]: [customerId],
				},
			},
		});

		await timeout(15000);

		const customerAfterAttach =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({
			customer: customerAfterAttach,
			productId: pro.id,
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 200,
		});

		await timeout(2000);

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			withPause: true,
		});

		const customerAfterRenewal =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerAfterRenewal,
			count: 2,
			latestTotal: 20,
			latestInvoiceProductId: pro.id,
		});

		expectCustomerFeatureCorrect({
			customer: customerAfterRenewal,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 100,
			usage: 0,
		});
		expect(customerAfterRenewal.features[TestFeature.Messages].balance).toBe(100);
	} finally {
		await updateFullFeatureFlagConfig({ config: originalConfig });
	}
});
