/**
 * Contract: an invoice-credit item with a feature_override prices tracks at
 * the merged schema (override rate; excluded feature denied, draws nothing),
 * and the override leaves the invoice-credit mutation guard in force.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomer,
	type CheckResponseV3,
	ErrCode,
	type FeatureConfigOverride,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const withFeatureOverride = (
	item: ReturnType<typeof items.consumable>,
	featureOverride: FeatureConfigOverride,
) => ({
	...item,
	config: { ...item.config, feature_override: featureOverride },
});

test.concurrent(
	`${chalk.yellowBright("invoice-credit feature-override: tracks use the merged schema, mutation guard holds")}`,
	async () => {
		// Catalog InvoiceCredits: Action1 = 0.2, Action2 = 0.6.
		const invoiceCreditItem = withFeatureOverride(
			items.consumable({
				featureId: TestFeature.InvoiceCredits,
				includedUsage: 100,
				price: 1,
			}),
			{
				schema: [
					{ metered_feature_id: TestFeature.Action1, credit_amount: 0.5 },
					{ metered_feature_id: TestFeature.Action2, excluded: true },
				],
			},
		);
		const product = products.base({
			id: "invoice-credit-override",
			items: [invoiceCreditItem],
		});

		const { customerId, autumnV2, autumnV2_3 } = await initScenario({
			customerId: "invoice-credit-override-excluded",
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [product] }),
			],
			actions: [s.attach({ productId: product.id })],
		});

		const excludedCheck = await autumnV2_3.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Action2,
		});
		expect(excludedCheck.allowed).toBe(false);

		// Action1 at 0.5: 50 units = 25 credits. Action2 draws nothing.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 50,
		});
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action2,
			value: 50,
		});

		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(customer.balances[TestFeature.InvoiceCredits]).toMatchObject({
			granted_balance: 100,
			current_balance: 75,
			usage: 25,
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage:
				"Invoice-credit balances can only be changed through tracked usage and billing-cycle resets",
			func: () =>
				autumnV2.balances.update({
					customer_id: customerId,
					feature_id: TestFeature.InvoiceCredits,
					remaining: 90,
				}),
		});
	},
);
