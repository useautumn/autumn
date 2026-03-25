import {
	AffectedResource,
	type ApiCustomerV5,
	ApiVersion,
	addToExpand,
	apiBalanceToAllowed,
	applyResponseVersionChanges,
	CustomerExpand,
	type CustomerLegacyData,
	dbToApiFeatureV1,
	type Feature,
	type FullCustomer,
	WebhookEventType,
} from "@autumn/shared";
import { sendSvixEvent } from "@/external/svix/svixHelpers.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getApiCustomerBase } from "@/internal/customers/cusUtils/apiCusUtils/getApiCustomerBase.js";

const cleanApiCustomer = ({
	ctx,
	apiCustomer,
	legacyData,
}: {
	ctx: AutumnContext;
	apiCustomer: ApiCustomerV5;
	legacyData: CustomerLegacyData;
}) => {
	const { autumn_id: _autumn_id, invoices: _invoices, ...rest } = apiCustomer;
	const cleanedApiCustomer: ApiCustomerV5 = rest;
	return applyResponseVersionChanges({
		input: cleanedApiCustomer,
		targetVersion: ctx.apiVersion,
		resource: AffectedResource.Customer,
		legacyData,
		ctx,
	});
};

const handleAllowanceUsed = async ({
	ctx,
	feature,
	oldFullCus,
	newFullCus,
}: {
	ctx: AutumnContext;
	feature: Feature;
	oldFullCus: FullCustomer;
	newFullCus: FullCustomer;
}) => {
	const clonedNewFullCus = structuredClone(newFullCus);
	for (const cusProduct of clonedNewFullCus.customer_products) {
		for (const cusEnt of cusProduct.customer_entitlements) {
			cusEnt.usage_allowed = false;
		}
	}

	const { apiCustomer: prevApiCustomer } = await getApiCustomerBase({
		ctx,
		fullCus: oldFullCus,
	});

	const { apiCustomer: newApiCustomer, legacyData: newLegacyData } =
		await getApiCustomerBase({
			ctx,
			fullCus: clonedNewFullCus,
		});

	const prevCusFeature = prevApiCustomer.balances[feature.id];
	const newCusFeature = newApiCustomer.balances[feature.id];

	const { allowed: oldAllowed } = apiBalanceToAllowed({
		apiBalance: prevCusFeature,
		apiSubject: prevApiCustomer,
		feature,
		requiredBalance: 1,
	});

	const { allowed: newAllowed } = apiBalanceToAllowed({
		apiBalance: newCusFeature,
		apiSubject: newApiCustomer,
		feature,
		requiredBalance: 1,
	});

	if (oldAllowed && !newAllowed) {
		await sendSvixEvent({
			ctx,
			eventType: WebhookEventType.CustomerThresholdReached,
			data: {
				threshold_type: "allowance_used",
				customer: cleanApiCustomer({
					ctx,
					apiCustomer: newApiCustomer,
					legacyData: newLegacyData,
				}),
				feature: dbToApiFeatureV1({
					ctx,
					dbFeature: feature,
					targetVersion: ctx.apiVersion,
				}),
			},
		});
	}
};

/** @deprecated Use checkUsageAlerts / checkLimitReached instead */
export const handleThresholdReached = async ({
	ctx,
	oldFullCus,
	newFullCus,
	feature,
}: {
	ctx: AutumnContext;
	oldFullCus: FullCustomer;
	newFullCus: FullCustomer;
	feature: Feature;
}) => {
	// Alter ctx expand if needed.
	if (ctx.apiVersion.lte(ApiVersion.V1_2)) {
		ctx = addToExpand({
			ctx,
			add: [
				CustomerExpand.BalancesFeature,
				CustomerExpand.SubscriptionsPlan,
				CustomerExpand.PurchasesPlan,
			],
		});
	}

	try {
		const { apiCustomer: prevApiCustomer } = await getApiCustomerBase({
			ctx,
			fullCus: oldFullCus,
		});

		const { apiCustomer: newApiCustomer, legacyData: newLegacyData } =
			await getApiCustomerBase({
				ctx,
				fullCus: newFullCus,
			});

		const { allowed: oldAllowed } = apiBalanceToAllowed({
			apiBalance: prevApiCustomer.balances[feature.id],
			apiSubject: prevApiCustomer,
			feature,
			requiredBalance: 1,
		});

		const { allowed: newAllowed } = apiBalanceToAllowed({
			apiBalance: newApiCustomer.balances[feature.id],
			apiSubject: newApiCustomer,
			feature,
			requiredBalance: 1,
		});

		if (oldAllowed && !newAllowed) {
			await sendSvixEvent({
				ctx,
				eventType: WebhookEventType.CustomerThresholdReached,
				data: {
					threshold_type: "limit_reached",
					customer: cleanApiCustomer({
						ctx,
						apiCustomer: newApiCustomer,
						legacyData: newLegacyData,
					}),
					feature: dbToApiFeatureV1({
						ctx,
						dbFeature: feature,
						targetVersion: ctx.apiVersion,
					}),
				},
			});
			ctx.logger.info(
				"Sent Svix event for threshold reached (type: limit_reached)",
			);
			return;
		}
		await handleAllowanceUsed({
			ctx,
			feature,
			oldFullCus,
			newFullCus,
		});
	} catch (error) {
		ctx.logger.error(`Failed to handle threshold reached, error: ${error}`, {
			error,
		});
	}
};
