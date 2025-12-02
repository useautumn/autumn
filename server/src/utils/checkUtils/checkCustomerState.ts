import {
	type AppEnv,
	CusProductStatus,
	cusProductToPrices,
	type FullCusProduct,
	type FullCustomer,
	isFreeProduct,
	type Organization,
} from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle.js";
import { getRelatedCusPrice } from "@server/internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import { isOneOff } from "@server/internal/products/productUtils.js";
import type Stripe from "stripe";
import { checkCusSubCorrect } from "./checkCustomerCorrect.js";

export type SubItemDetail = {
	priceId: string;
	quantity: number;
	productName?: string;
	priceName?: string;
};

export type CheckResult = {
	passed: boolean;
	errors: string[];
	warnings: string[];
	checks: {
		name: string;
		passed: boolean;
		message?: string;
	}[];
	// Detailed sub info when there's a mismatch
	subscriptionDetails?: {
		subId: string;
		actualItems: SubItemDetail[];
		expectedItems: SubItemDetail[];
	};
};

/**
 * Runs state checks on a customer and returns structured results.
 * Does not throw - captures all errors in the result object.
 */
export const runCustomerStateChecks = async ({
	db,
	fullCus,
	subs,
	schedules,
	org,
	env,
}: {
	db: DrizzleCli;
	fullCus: FullCustomer;
	subs: Stripe.Subscription[];
	schedules: Stripe.SubscriptionSchedule[];
	org: Organization;
	env: AppEnv;
}): Promise<CheckResult> => {
	const result: CheckResult = {
		passed: true,
		errors: [],
		warnings: [],
		checks: [],
	};

	const cusProducts = fullCus.customer_products || [];

	// Check: Subscription correctness (from checkCusSubCorrect)
	try {
		await checkCusSubCorrect({
			db,
			fullCus,
			subs,
			schedules,
			org,
			env,
		});
		result.checks.push({
			name: "Subscription Correctness",
			passed: true,
		});
	} catch (error) {
		result.passed = false;
		const errorMsg = error instanceof Error ? error.message : String(error);
		result.errors.push(`Subscription check failed: ${errorMsg}`);
		result.checks.push({
			name: "Subscription Correctness",
			passed: false,
			message: errorMsg,
		});
	}

	// Check each customer product
	for (const cusProduct of cusProducts) {
		const productName = cusProduct.product?.name || cusProduct.product_id;

		// Check: Scheduled products should have a main product
		if (cusProduct.status === CusProductStatus.Scheduled) {
			const mainCusProd = cusProducts.find(
				(cp: FullCusProduct) =>
					cp.product.group === cusProduct.product.group &&
					cp.id !== cusProduct.id &&
					cp.status !== CusProductStatus.Scheduled &&
					(cusProduct.internal_entity_id
						? cusProduct.internal_entity_id === cp.internal_entity_id
						: true),
			);

			if (!mainCusProd) {
				result.passed = false;
				result.errors.push(
					`Scheduled product "${productName}" has no main product`,
				);
				result.checks.push({
					name: `Scheduled Product: ${productName}`,
					passed: false,
					message: "No main product found for scheduled product",
				});
			} else {
				result.checks.push({
					name: `Scheduled Product: ${productName}`,
					passed: true,
				});
			}
		}

		// Check: No duplicate non-add-on products in same group
		if (
			!cusProduct.product.is_add_on &&
			cusProduct.status !== CusProductStatus.Scheduled
		) {
			const group = cusProduct.product.group;
			const otherCusProd = cusProducts.find(
				(cp: FullCusProduct) =>
					cp.product.group === group &&
					cp.id !== cusProduct.id &&
					!cp.product.is_add_on &&
					cp.status !== CusProductStatus.Scheduled &&
					cp.internal_entity_id === cusProduct.internal_entity_id,
			);

			if (otherCusProd) {
				result.passed = false;
				result.errors.push(
					`Duplicate products in group "${group}": "${productName}" and "${otherCusProd.product?.name}"`,
				);
				result.checks.push({
					name: `Group Uniqueness: ${productName}`,
					passed: false,
					message: `Found duplicate: ${otherCusProd.product?.name}`,
				});
			} else {
				result.checks.push({
					name: `Group Uniqueness: ${productName}`,
					passed: true,
				});
			}
		}

		// Check: Customer entitlements with usage_allowed should have related cus_price
		const prices = cusProductToPrices({ cusProduct });
		if (
			!isOneOff(prices) &&
			!isFreeProduct({ prices }) &&
			cusProduct.status !== CusProductStatus.Scheduled
		) {
			for (const cusEnt of cusProduct.customer_entitlements || []) {
				const cusPrice = getRelatedCusPrice(cusEnt, cusProduct.customer_prices);

				if (cusEnt.usage_allowed && !cusPrice) {
					result.passed = false;
					result.errors.push(
						`Product "${productName}": Feature "${cusEnt.feature_id}" has usage_allowed but no related cus_price`,
					);
					result.checks.push({
						name: `Entitlement Price: ${cusEnt.feature_id}`,
						passed: false,
						message: "usage_allowed but no cus_price",
					});
				}
			}
		}
	}

	// Check: Subscription IDs match Stripe
	const subIds = cusProducts.flatMap((cp) => cp.subscription_ids) || [];
	const stripeSubs = subs.filter((sub) => {
		const subCustomerId =
			typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
		return subCustomerId === fullCus.processor?.id;
	});

	if (stripeSubs.length !== subIds.length) {
		result.passed = false;
		result.errors.push(
			`Expected ${subIds.length} subs in total, found ${stripeSubs.length} in Stripe`,
		);
	} else {
		result.checks.push({
			name: `Subscription Match`,
			passed: true,
		});
	}

	// Add summary info
	if (result.errors.length === 0 && result.warnings.length === 0) {
		result.checks.unshift({
			name: "Overall Status",
			passed: true,
			message: "All checks passed",
		});
	}

	return result;
};
