/** PUT and PATCH customization preserve valid pools while rejecting pay-per-use pooled pricing.
 * Unrelated edits preserve the pool; grant increases apply the delta; enabling pooling carries usage. */

import { test } from "bun:test";
import { ErrCode, type UpdateSubscriptionV1ParamsInput } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import chalk from "chalk";
import {
	buildPooledCustomization,
	buildRejectedPooledPricingCustomization,
	expectPooledCustomizationResult,
	expectPooledCustomizationUnchanged,
	type PooledCustomizationCase,
	setupPooledCustomizationScenario,
} from "../utils/pooledBalanceCustomizationTestUtils.js";

const runPooledCustomizationCase = async ({
	surface,
	case: customizationCase,
}: {
	surface: "put" | "patch";
	case: PooledCustomizationCase;
}) => {
	const scenario = await setupPooledCustomizationScenario({
		customerId: `pooled-customize-${surface}-${customizationCase}`,
		case: customizationCase,
	});

	await scenario.autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
		{
			customer_id: scenario.customerId,
			customer_product_id: scenario.sourceCustomerProduct.id,
			entity_id: scenario.entities[0].id,
			customize: buildPooledCustomization({
				case: customizationCase,
				surface,
			}),
		},
	);

	await expectPooledCustomizationResult({
		scenario,
		case: customizationCase,
		surface,
	});
};

const runRejectedPooledPricingCase = async ({
	surface,
}: {
	surface: "put" | "patch";
}) => {
	const scenario = await setupPooledCustomizationScenario({
		customerId: `pooled-customize-${surface}-reject-usage-based`,
		case: "increase_grant",
	});

	await expectAutumnError({
		errCode: ErrCode.InvalidProductItem,
		errMessage: "Pooled items cannot use usage-based pricing",
		func: () =>
			scenario.autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
				{
					customer_id: scenario.customerId,
					customer_product_id: scenario.sourceCustomerProduct.id,
					entity_id: scenario.entities[0].id,
					customize: buildRejectedPooledPricingCustomization({
						surface,
					}),
				},
			),
	});

	await expectPooledCustomizationUnchanged({ scenario });
};

test.concurrent(
	`${chalk.yellowBright("pooled customize put: unrelated item preserves the pool")}`,
	async () => {
		await runPooledCustomizationCase({
			surface: "put",
			case: "unrelated_item",
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("pooled customize put: pooled grant increase applies the delta")}`,
	async () => {
		await runPooledCustomizationCase({
			surface: "put",
			case: "increase_grant",
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("pooled customize put: private to pooled carries usage")}`,
	async () => {
		await runPooledCustomizationCase({
			surface: "put",
			case: "enable_pooling",
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("pooled customize patch: unrelated item preserves the pool")}`,
	async () => {
		await runPooledCustomizationCase({
			surface: "patch",
			case: "unrelated_item",
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("pooled customize patch: pooled grant increase applies the delta")}`,
	async () => {
		await runPooledCustomizationCase({
			surface: "patch",
			case: "increase_grant",
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("pooled customize patch: private to pooled carries usage")}`,
	async () => {
		await runPooledCustomizationCase({
			surface: "patch",
			case: "enable_pooling",
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("pooled customize put: pay-per-use pooled pricing is rejected")}`,
	async () => {
		await runRejectedPooledPricingCase({
			surface: "put",
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("pooled customize patch: pay-per-use pooled pricing is rejected")}`,
	async () => {
		await runRejectedPooledPricingCase({
			surface: "patch",
		});
	},
);
