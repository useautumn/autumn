/**
 * Unit tests for computeUpdateSubscriptionIntent function.
 *
 * Tests intent detection priority:
 * - Version change takes priority over all other intents
 * - Options without items triggers UpdateQuantity
 * - Default falls back to UpdatePlan
 */

import { describe, expect, test } from "bun:test";
import {
	type FullCusProduct,
	UpdateSubscriptionIntent,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import chalk from "chalk";
import { setupUpdateSubscriptionIntent } from "@/internal/billing/v2/actions/updateSubscription/setup/setupUpdateSubscriptionIntent";

const customerProduct = {
	prices: [],
} as unknown as FullCusProduct;

const baseParams: UpdateSubscriptionV1Params = {
	customer_id: "cus_test",
	plan_id: "prod_test",
};

describe(chalk.yellowBright("computeUpdateSubscriptionIntent"), () => {
	describe(chalk.cyan("Version parameter priority"), () => {
		test("returns UpdatePlan when version is specified", () => {
			const params: UpdateSubscriptionV1Params = {
				...baseParams,
				version: 2,
			};

			const result = setupUpdateSubscriptionIntent({
				params,
				checkoutMode: null,
				customerProduct,
			});

			expect(result).toBe(UpdateSubscriptionIntent.UpdatePlan);
		});

		test("returns UpdatePlan when version is specified even with options", () => {
			const params: UpdateSubscriptionV1Params = {
				...baseParams,
				version: 3,
				feature_quantities: [{ feature_id: "seats", quantity: 10 }],
			};

			const result = setupUpdateSubscriptionIntent({
				params,
				checkoutMode: null,
				customerProduct,
			});

			expect(result).toBe(UpdateSubscriptionIntent.UpdatePlan);
		});

		test("returns UpdatePlan when version is 0", () => {
			const params: UpdateSubscriptionV1Params = {
				...baseParams,
				version: 0,
			};

			const result = setupUpdateSubscriptionIntent({
				params,
				checkoutMode: null,
				customerProduct,
			});

			expect(result).toBe(UpdateSubscriptionIntent.UpdatePlan);
		});
	});

	describe(chalk.cyan("UpdateQuantity intent"), () => {
		test("returns UpdateQuantity when options provided without customize", () => {
			const params: UpdateSubscriptionV1Params = {
				...baseParams,
				feature_quantities: [{ feature_id: "seats", quantity: 5 }],
			};

			const result = setupUpdateSubscriptionIntent({
				params,
				checkoutMode: null,
				customerProduct,
			});

			expect(result).toBe(UpdateSubscriptionIntent.UpdateQuantity);
		});

		test("returns UpdateQuantity with multiple options", () => {
			const params: UpdateSubscriptionV1Params = {
				...baseParams,
				feature_quantities: [
					{ feature_id: "seats", quantity: 5 },
					{ feature_id: "storage", quantity: 100 },
				],
			};

			const result = setupUpdateSubscriptionIntent({
				params,
				checkoutMode: null,
				customerProduct,
			});

			expect(result).toBe(UpdateSubscriptionIntent.UpdateQuantity);
		});
	});

	describe(chalk.cyan("UpdatePlan intent (default)"), () => {
		test("returns UpdatePlan when customize provided", () => {
			const params: UpdateSubscriptionV1Params = {
				...baseParams,
				customize: {
					items: [{ feature_id: "seats", included: 10 }],
				},
			};

			const result = setupUpdateSubscriptionIntent({
				params,
				checkoutMode: null,
				customerProduct,
			});

			expect(result).toBe(UpdateSubscriptionIntent.UpdatePlan);
		});

		test("returns UpdatePlan when both options and customize provided", () => {
			const params: UpdateSubscriptionV1Params = {
				...baseParams,
				feature_quantities: [{ feature_id: "seats", quantity: 5 }],
				customize: {
					items: [{ feature_id: "seats", included: 10 }],
				},
			};

			const result = setupUpdateSubscriptionIntent({
				params,
				checkoutMode: null,
				customerProduct,
			});

			expect(result).toBe(UpdateSubscriptionIntent.UpdatePlan);
		});
	});
});
