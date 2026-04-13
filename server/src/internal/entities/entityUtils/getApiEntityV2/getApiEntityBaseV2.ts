import {
	type ApiEntityV2,
	ApiEntityV2Schema,
	type FullSubject,
	InternalError,
} from "@autumn/shared";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getApiBalancesV2 } from "@/internal/customers/cusUtils/getApiCustomerV2/getApiBalance/getApiBalancesV2.js";

export const getApiEntityBaseV2 = async ({
	ctx,
	fullSubject,
}: {
	ctx: RequestContext;
	fullSubject: FullSubject;
}): Promise<{ apiEntity: ApiEntityV2 }> => {
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

	return {
		apiEntity: ApiEntityV2Schema.parse({
			id: entity.id || null,
			name: entity.name || null,
			customer_id: fullSubject.customer.id || fullSubject.customer.internal_id,
			created_at: entity.created_at,
			env: fullSubject.customer.env,
			subscriptions: [],
			purchases: [],
			balances,
			flags,
			billing_controls: {
				spend_limits: entity.spend_limits ?? undefined,
				usage_alerts: entity.usage_alerts ?? undefined,
				overage_allowed: entity.overage_allowed ?? undefined,
			},
			invoices: undefined,
		} satisfies ApiEntityV2),
	};
};
