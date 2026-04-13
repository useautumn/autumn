import {
	type ApiEntityV2,
	ApiEntityV2Schema,
	type EntityLegacyData,
	type FullSubject,
	InternalError,
	scopeExpandForCtx,
} from "@autumn/shared";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getApiBalancesV2 } from "@/internal/customers/cusUtils/getApiCustomerV2/getApiBalance/getApiBalancesV2.js";
import { getApiSubscriptionsV2 } from "@/internal/customers/cusUtils/getApiCustomerV2/getApiSubscription/getApiSubscriptionsV2.js";

export const getApiEntityBaseV2 = async ({
	ctx,
	fullSubject,
	withAutumnId = false,
}: {
	ctx: RequestContext;
	fullSubject: FullSubject;
	withAutumnId?: boolean;
}): Promise<{ apiEntity: ApiEntityV2; legacyData: EntityLegacyData }> => {
	const entity = fullSubject.entity;
	if (!entity) {
		throw new InternalError({
			message: "Entity subject required for getApiEntityBaseV2",
			code: "entity_subject_required",
		});
	}

	const { balances, flags } = getApiBalancesV2({
		ctx,
		fullSubject,
	});
	const subscriptionsScopedCtx = scopeExpandForCtx({
		ctx,
		prefix: "subscriptions",
	});
	const {
		subscriptions,
		purchases,
		legacyData: cusProductLegacyData,
	} = await getApiSubscriptionsV2({
		ctx: subscriptionsScopedCtx,
		fullSubject,
	});

	return {
		apiEntity: ApiEntityV2Schema.parse({
			autumn_id: withAutumnId ? entity.internal_id : undefined,
			id: entity.id || null,
			name: entity.name || null,
			customer_id: fullSubject.customer.id || fullSubject.customer.internal_id,
			feature_id: entity.feature_id || undefined,
			created_at: entity.created_at,
			env: fullSubject.customer.env,
			subscriptions,
			purchases,
			balances,
			flags,
			billing_controls: {
				spend_limits: entity.spend_limits ?? undefined,
				usage_alerts: entity.usage_alerts ?? undefined,
				overage_allowed: entity.overage_allowed ?? undefined,
			},
			invoices: undefined,
		} satisfies ApiEntityV2),
		legacyData: {
			cusProductLegacyData,
		},
	};
};
