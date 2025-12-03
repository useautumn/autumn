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
import { upstash } from "../../external/redis/initUpstash.js";
import { checkCusSubCorrect } from "./checkCustomerCorrect.js";

export type SubItemDetail = {
	priceId: string;
	quantity: number;
	productName?: string;
	priceName?: string;
};

export type RedisChecksState = {
	status: "new" | "ongoing" | "archived";
	customer: {
		id: string;
		email: string;
		name: string;
		env: AppEnv;
		processor?: string;
	};
	org_id: string;
	env: AppEnv;
	checks: {
		type: Exclude<CheckResult["checks"][number]["type"], "overall_status">;
		passed: boolean;
		message: string;
		data?: unknown;
	}[];
};

export type CheckResult = {
	passed: boolean;
	errors: string[];
	warnings: string[];
	checks: {
		name: string;
		type:
			| "subscription_correctness"
			| "customer_product_correctness"
			| "sub_id_matching"
			| "group_uniqueness"
			| "entitlement_price_correctness"
			| "overall_status";
		passed: boolean;
		message?: string;
		data?: unknown;
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
	await testSubscriptionCorrectness({
		db,
		fullCus,
		subs,
		schedules,
		org,
		env,
		result,
	});

	// Check each customer product
	await checkEachCustomerProduct({
		db,
		fullCus,
		cusProducts,
		result,
	});

	// Check: Subscription IDs match Stripe
	await checkSubscriptionIdsMatchStripe({
		db,
		fullCus,
		cusProducts,
		subs,
		result,
	});

	// Add summary info
	if (result.errors.length === 0 && result.warnings.length === 0) {
		result.checks.unshift({
			type: "overall_status",
			name: "Overall Status",
			passed: true,
			message: "All checks passed",
		});
	}

	const stateKey = `state:${org.id}:${env}:${fullCus.internal_id}`;
	const existingStateData = (await upstash.get(
		stateKey,
	)) as RedisChecksState | null;

	console.log("Existing state:", existingStateData);
	type CheckType = RedisChecksState["checks"][number]["type"];

	// Get new failed checks (excluding overall_status)
	const newFailedChecks = result.checks
		.filter(
			(x): x is typeof x & { type: CheckType } => x.type !== "overall_status",
		)
		.filter((x) => !x.passed);

	if (existingStateData) {
		// Create sets of check types for comparison
		const existingFailedTypes = new Set<CheckType>(
			existingStateData.checks.map((x) => x.type),
		);
		const newFailedTypes = new Set<CheckType>(
			newFailedChecks.map((x) => x.type),
		);

		// Set mathematics
		const toRemove = new Set<CheckType>(
			[...existingFailedTypes].filter((type) => !newFailedTypes.has(type)),
		);
		const toAdd = new Set<CheckType>(
			[...newFailedTypes].filter((type) => !existingFailedTypes.has(type)),
		);

		// If all checks now pass, archive the state
		if (newFailedTypes.size === 0) {
			const archivedState: RedisChecksState = {
				...existingStateData,
				status: "archived",
				checks: [],
			};
			await upstash.set(stateKey, JSON.stringify(archivedState));
		} else {
			// Filter out checks that no longer fail
			const updatedChecks = existingStateData.checks.filter(
				(check) => !toRemove.has(check.type),
			);

			// Append new failing checks
			for (const newCheck of newFailedChecks) {
				if (toAdd.has(newCheck.type)) {
					updatedChecks.push({
						type: newCheck.type,
						passed: newCheck.passed,
						message: newCheck.message ?? "",
						data: newCheck.data as unknown,
					});
				}
			}

			// Determine status: if no changes and still failing, set to "ongoing"
			const noChanges = toRemove.size === 0 && toAdd.size === 0;
			const newStatus =
				noChanges && existingStateData.status === "new"
					? "ongoing"
					: existingStateData.status;

			const updatedState: RedisChecksState = {
				...existingStateData,
				status: newStatus,
				checks: updatedChecks,
			};
			await upstash.set(stateKey, JSON.stringify(updatedState));
		}
	} else if (newFailedChecks.length > 0) {
		// Create new state when there's no existing state and some checks fail
		const newState: RedisChecksState = {
			status: "new",
			customer: {
				id: fullCus.id ?? "",
				email: fullCus.email || "",
				name: fullCus.name || "",
				env: env,
				processor: fullCus.processor,
			},
			org_id: org.id,
			env: env,
			checks: newFailedChecks.map((x) => ({
				type: x.type,
				passed: x.passed,
				message: x.message ?? "",
				data: x.data as unknown,
			})),
		};
		await upstash.set(stateKey, JSON.stringify(newState));
	}

	// state:customer_id:org:env

	// {
	// 	status: 'new', 'ongoing', 'archived'
	// 	customer: {
	// 		id: fullCus.id,
	// 		email: fullCus.email,
	// 		name: fullCus.name,
	// 		env: env,
	// 		processor: fullCus.processor,
	// 	},
	// 	org_id: org.id,
	// 	env: env,
	// 	checks: [
	// 		{
	// 			type: "subscription_correctness",
	// 			passed: result.passed,
	// 			message: result.errors.join("\n"),
	// 			data?: any;
	// 		}
	// 	]
	// }

	return result;
};

export const testSubscriptionCorrectness = async ({
	db,
	fullCus,
	subs,
	schedules,
	org,
	env,
	result,
}: {
	db: DrizzleCli;
	fullCus: FullCustomer;
	subs: Stripe.Subscription[];
	schedules: Stripe.SubscriptionSchedule[];
	org: Organization;
	env: AppEnv;
	result: CheckResult;
}): Promise<void> => {
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
			type: "subscription_correctness",
			passed: true,
		});
	} catch (error) {
		result.passed = false;
		const errorMsg = error instanceof Error ? error.message : String(error);
		result.errors.push(`Subscription check failed: ${errorMsg}`);
		result.checks.push({
			name: "Subscription Correctness",
			type: "subscription_correctness",
			passed: false,
			message: errorMsg,
		});
	}
};

export const checkEachCustomerProduct = async ({
	db,
	fullCus,
	cusProducts,
	result,
}: {
	db: DrizzleCli;
	fullCus: FullCustomer;
	cusProducts: FullCusProduct[];
	result: CheckResult;
}): Promise<void> => {
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
					type: "customer_product_correctness",
					passed: false,
					message: "No main product found for scheduled product",
				});
			} else {
				result.checks.push({
					name: `Scheduled Product: ${productName}`,
					type: "customer_product_correctness",
					passed: true,
				});
			}
		}

		// Check: No duplicate non-add-on, non-one-off products in same group
		// One-off products (like t-shirts) can coexist with any other products
		const currentPrices = cusProductToPrices({ cusProduct });
		const isCurrentOneOff = isOneOff(currentPrices);

		if (
			!cusProduct.product.is_add_on &&
			!isCurrentOneOff &&
			cusProduct.status !== CusProductStatus.Scheduled
		) {
			const group = cusProduct.product.group;
			const otherCusProd = cusProducts.find((cp: FullCusProduct) => {
				if (cp.product.group !== group) return false;
				if (cp.id === cusProduct.id) return false;
				if (cp.product.is_add_on) return false;
				if (cp.status === CusProductStatus.Scheduled) return false;
				if (cp.internal_entity_id !== cusProduct.internal_entity_id)
					return false;

				// Also skip one-off products
				const otherPrices = cusProductToPrices({ cusProduct: cp });
				if (isOneOff(otherPrices)) return false;

				return true;
			});

			if (otherCusProd) {
				result.passed = false;
				result.errors.push(
					`Duplicate products in group "${group}": "${productName}" and "${otherCusProd.product?.name}"`,
				);
				result.checks.push({
					name: `Group Uniqueness: ${productName}`,
					type: "group_uniqueness",
					passed: false,
					message: `Found duplicate: ${otherCusProd.product?.name}`,
				});
			} else {
				result.checks.push({
					name: `Group Uniqueness: ${productName}`,
					type: "group_uniqueness",
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
						type: "entitlement_price_correctness",
						passed: false,
						message: "usage_allowed but no cus_price",
					});
				}
			}
		}
	}
};

export const checkSubscriptionIdsMatchStripe = async ({
	db,
	fullCus,
	cusProducts,
	subs,
	result,
}: {
	db: DrizzleCli;
	fullCus: FullCustomer;
	cusProducts: FullCusProduct[];
	subs: Stripe.Subscription[];
	result: CheckResult;
}): Promise<void> => {
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
			type: "sub_id_matching",
			passed: true,
		});
	}
};
