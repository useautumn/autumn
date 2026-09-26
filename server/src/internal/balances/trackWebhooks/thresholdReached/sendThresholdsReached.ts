import type { ThresholdReached } from "@autumn/balance-webhooks";
import {
	AffectedResource,
	applyResponseVersionChanges,
	customerToSvixTags,
	dbToApiFeatureV1,
	type FullSubject,
	findFeatureById,
	getApiCustomerBaseV2,
	WebhookEventType,
} from "@autumn/shared";
import { sendSvixEvent } from "@/external/svix/svixHelpers.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

/** The customer at the caller's API version, without the autumn id or invoices the event never carried. */
const renderCustomer = async ({
	ctx,
	fullSubject,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
}) => {
	const { apiCustomer, legacyData } = await getApiCustomerBaseV2({
		ctx,
		fullSubject,
		withAutumnId: false,
	});
	return applyResponseVersionChanges({
		input: apiCustomer,
		targetVersion: ctx.apiVersion,
		resource: AffectedResource.Customer,
		legacyData,
		ctx,
	});
};

/** One `customer.threshold_reached` per crossing, all carrying the customer rendered once. */
export const sendThresholdsReached = async ({
	ctx,
	fullSubject,
	thresholdsReached,
	entityId,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	thresholdsReached: ThresholdReached[];
	entityId?: string | null;
}): Promise<void> => {
	const customer = await renderCustomer({ ctx, fullSubject });
	const tags = customerToSvixTags({
		customerId: fullSubject.customer.id ?? fullSubject.customer.internal_id,
		entityId,
	});
	for (const thresholdReached of thresholdsReached) {
		const feature = findFeatureById({
			features: ctx.features,
			featureId: thresholdReached.featureId,
		});
		if (!feature) continue;
		await sendSvixEvent({
			ctx,
			eventType: WebhookEventType.CustomerThresholdReached,
			data: {
				threshold_type: thresholdReached.type,
				customer,
				feature: dbToApiFeatureV1({
					ctx,
					dbFeature: feature,
					targetVersion: ctx.apiVersion,
				}),
			},
			tags,
		});
	}
};
