import {
	AffectedResource,
	type ApiCustomerV5,
	ApiVersion,
	addToExpand,
	applyResponseVersionChanges,
	CusExpand,
	type CustomerLegacyData,
	dbToApiFeatureV1,
	type Feature,
	type FullCustomer,
	WebhookEventType,
} from "@autumn/shared";
import { sendSvixEvent } from "@/external/svix/svixHelpers.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { apiBalanceToAllowed } from "@/internal/api/check/checkUtils/apiBalanceToAllowed.js";
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
	return applyResponseVersionChanges<ApiCustomerV5, CustomerLegacyData>({
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

	const oldAllowed = apiBalanceToAllowed({
		apiBalance: prevCusFeature,
		feature,
		requiredBalance: 1,
	});

	const newAllowed = apiBalanceToAllowed({
		apiBalance: newCusFeature,
		feature,
		requiredBalance: 1,
	});

	if (oldAllowed === true && newAllowed === false) {
		await sendSvixEvent({
			org: ctx.org,
			env: ctx.env,
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
			add: [CusExpand.BalancesFeature, CusExpand.SubscriptionsPlan],
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

		const oldAllowed = apiBalanceToAllowed({
			apiBalance: prevApiCustomer.balances[feature.id],
			feature,
			requiredBalance: 1,
		});

		const newAllowed = apiBalanceToAllowed({
			apiBalance: newApiCustomer.balances[feature.id],
			feature,
			requiredBalance: 1,
		});

		if (oldAllowed === true && newAllowed === false) {
			await sendSvixEvent({
				org: ctx.org,
				env: ctx.env,
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
	} catch (error: any) {
		ctx.logger.error("Failed to handle threshold reached", {
			error,
			message: error?.message,
		});
	}
};
