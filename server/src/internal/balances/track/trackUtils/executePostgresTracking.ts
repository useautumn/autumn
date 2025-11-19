import type { ApiBalance, TrackParams, TrackResponseV2 } from "@autumn/shared";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { getApiCustomerBase } from "../../../customers/cusUtils/apiCusUtils/getApiCustomerBase.js";
import { getOrCreateCustomer } from "../../../customers/cusUtils/getOrCreateCustomer.js";
import type { FeatureDeduction } from "./getFeatureDeductions.js";
import { runDeductionTx } from "./runDeductionTx.js";

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

	const { fullCus: updatedFullCus, actualDeductions } = await runDeductionTx({
		ctx,
		customerId: body.customer_id,
		entityId: body.entity_id,
		deductions: featureDeductions,
		overageBehaviour: body.overage_behavior,
		eventInfo: {
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

	if (updatedFullCus) {
		const { apiCustomer } = await getApiCustomerBase({
			ctx,
			fullCus: updatedFullCus,
		});

		const balancesRes: Record<string, ApiBalance> = {};
		for (const featureId of Object.keys(actualDeductions)) {
			balancesRes[featureId] = apiCustomer.balances[featureId];
		}

		if (Object.keys(balancesRes).length > 1) {
			response.balances = balancesRes;
		} else {
			response.balance = Object.values(balancesRes)?.[0];
		}
	}

	return response;
};
