import type { AppEnv, FullCustomer, Organization } from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle.js";
import type Stripe from "stripe";
import { checkCusProducts } from "./checkCusProducts.js";
import { checkCusSubCorrect, SubItemMismatchError } from "./checkCustomerCorrect.js";
import { checkSubCountMatch } from "./checkSubCountMatch.js";
import { saveCheckState } from "./saveCheckState.js";
import type { StateCheckResult } from "./stateCheckTypes.js";

// Re-export for backwards compatibility
export type { RedisChecksState } from "./stateCheckTypes.js";

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
}): Promise<StateCheckResult> => {
	const result: StateCheckResult = {
		passed: true,
		errors: [],
		warnings: [],
		checks: [],
	};


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
	await checkCusProducts({
		fullCus,
		result,
	});

	// Check: Subscription IDs match Stripe
	await checkSubCountMatch({
		fullCus,
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

	// Save to Redis only if there are failures
	await saveCheckState({ org, env, fullCus, result });

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
	result: StateCheckResult;
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

		// Capture subscription item details if this is a SubItemMismatchError
		if (error instanceof SubItemMismatchError) {
			result.subscriptionDetails = {
				subId: error.subId,
				actualItems: error.actualItems,
				expectedItems: error.expectedItems,
			};
		}
	}
};
