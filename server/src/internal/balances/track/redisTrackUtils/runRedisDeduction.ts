import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { getCachedApiCustomer } from "../../../customers/cusUtils/apiCusCacheUtils/getCachedApiCustomer.js";
import { globalBatchingManager } from "./BatchingManager.js";

interface FeatureDeduction {
	feature: {
		id: string;
		[key: string]: any;
	};
	deduction: number;
}

interface RunRedisDeductionParams {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	featureDeductions: FeatureDeduction[];
	overageBehavior: "cap" | "reject";
}

interface DeductionResult {
	success: boolean;
	error?: string;
	internalCustomerId?: string;
	internalEntityId?: string;
}

/**
 * Executes deductions against cached customer data in Redis
 * Uses batching manager to efficiently process multiple deductions
 */
export const runRedisDeduction = async ({
	ctx,
	customerId,
	entityId,
	featureDeductions,
	overageBehavior,
}: RunRedisDeductionParams): Promise<DeductionResult> => {
	const { org, env } = ctx;

	// Ensure customer is in cache
	const { apiCustomer: cachedCustomer } = await getCachedApiCustomer({
		ctx,
		customerId,
	});

	// console.log("Credits before track:", {
	// 	balance: cachedCustomer?.features?.credits?.balance,
	// 	monthlyBalance: cachedCustomer?.features?.credits?.breakdown?.[0]?.balance,
	// 	lifetimeBalance: cachedCustomer?.features?.credits?.breakdown?.[1]?.balance,
	// });

	// Map feature deductions to the format expected by batching manager
	const mappedDeductions = featureDeductions.map(({ feature, deduction }) => ({
		featureId: feature.id,
		amount: deduction,
	}));

	const result = await globalBatchingManager.deduct({
		customerId,
		featureDeductions: mappedDeductions,
		orgId: org.id,
		env,
		entityId,
		overageBehavior,
	});

	if (!result.success) {
		ctx.logger.info(
			`Track failed: ${result.error} for customer: ${customerId}`,
		);
	}

	// const after = await getCachedApiCustomer({
	// 	ctx,
	// 	customerId,
	// });

	// console.log("Credits after track:", {
	// 	balance: after?.features?.credits?.balance,
	// 	monthlyBalance: after?.features?.credits?.breakdown?.[0]?.balance,
	// 	lifetimeBalance: after?.features?.credits?.breakdown?.[1]?.balance,
	// });

	return {
		success: result.success,
		internalCustomerId: cachedCustomer?.autumn_id,
		internalEntityId: undefined, // TODO: Get from cached entity when entity support is added
	};
};
