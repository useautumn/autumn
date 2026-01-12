import type {
	ApiBalance,
	FullCustomer,
	TrackParams,
	TrackResponseV2,
} from "@autumn/shared";
import { InsufficientBalanceError } from "@autumn/shared";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { getApiCustomerBase } from "../../../customers/cusUtils/apiCusUtils/getApiCustomerBase.js";
import { getOrCreateCustomer } from "../../../customers/cusUtils/getOrCreateCustomer.js";
import type { FeatureDeduction } from "../../utils/types/featureDeduction.js";
import { getTrackBalancesResponse } from "./getTrackBalancesResponse.js";
import { runDeductionTx } from "./runDeductionTx.js";

const catchInsufficientBalanceError = ({
	error,
	body,
}: {
	error: unknown;
	body: TrackParams;
}) => {
	// Check if it's an insufficient balance error from PostgreSQL
	if (
		error instanceof Error &&
		error.message?.includes("INSUFFICIENT_BALANCE")
	) {
		// Parse the error message: INSUFFICIENT_BALANCE|featureId:{id}|value:{amount}|remaining:{remaining}
		const parts = error.message.split("|");
		const featureIdMatch = parts[1]?.match(/featureId:(.*)/);
		const valueMatch = parts[2]?.match(/value:(.*)/);

		const featureId = featureIdMatch?.[1] || body.feature_id;
		const value = valueMatch?.[1]
			? Number.parseFloat(valueMatch[1])
			: (body.value ?? 1);

		throw new InsufficientBalanceError({
			value,
			featureId,
		});
	}

	throw error;
};

/**
 * Execute PostgreSQL-based tracking with full transaction support
 */
export const executePostgresTracking = async ({
	ctx,
	body,
	featureDeductions,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	featureDeductions: FeatureDeduction[];
}) => {
	const response: TrackResponseV2 = {
		// id: "",
		// code: SuccessCode.EventReceived,
		customer_id: body.customer_id,
		entity_id: body.entity_id,
		value: body.value ?? 1,
		// feature_id: body.feature_id,
		event_name: body.event_name,
		balance: null,
	};

	const fullCus = await getOrCreateCustomer({
		ctx,
		customerId: body.customer_id,
		customerData: body.customer_data,
		entityId: body.entity_id,
		entityData: body.entity_data,
		withEntities: true,
	});

	let updatedFullCus: FullCustomer | undefined | null;
	let actualDeductions: Record<string, number> = {};

	try {
		const result = await runDeductionTx({
			ctx,
			customerId: body.customer_id,
			entityId: body.entity_id,
			deductions: featureDeductions,
			overageBehaviour: body.overage_behavior,
			eventInfo: body.idempotency_key
				? undefined
				: {
						event_name: body.feature_id || body.event_name || "",
						value: body.value ?? 1,
						properties: body.properties,
						timestamp: body.timestamp,
						idempotency_key: body.idempotency_key,
					},
			refreshCache: true,
			fullCus,
			skipAdditionalBalance: true,
		});
		updatedFullCus = result.fullCus;
		actualDeductions = result.actualDeductions;
	} catch (error) {
		catchInsufficientBalanceError({ error, body });
	}

	if (updatedFullCus) {
		const { apiCustomer } = await getApiCustomerBase({
			ctx,
			fullCus: updatedFullCus,
		});

		// Build balances response matching Lua batchDeduction logic:
		// 1. Always include primary features from featureDeductions (they were requested)
		// 2. Only include credit systems if they were actually used (in actualDeductions)
		const balancesRes: Record<string, ApiBalance> = {};

		// Add primary features (always - they were requested to be tracked)
		for (const deduction of featureDeductions) {
			const balance = apiCustomer.balances[deduction.feature.id];
			if (balance) {
				balancesRes[deduction.feature.id] = balance;
			}

			// If a feature is unlimited, add it to the balances response
		}

		// Add credit systems only if they were actually used
		for (const featureId of Object.keys(actualDeductions)) {
			if (!balancesRes[featureId]) {
				const balance = apiCustomer.balances[featureId];
				if (balance) {
					balancesRes[featureId] = balance;
				}
			}
		}

		const finalBalances = getTrackBalancesResponse({
			featureDeductions,
			features: ctx.features,
			balances: balancesRes,
		});

		response.balance = finalBalances.balance;
		response.balances = finalBalances.balances;
	}

	return response;
};
