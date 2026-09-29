import type { CreateScheduleBillingContext } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	assertNoDuplicateSubscriptionIds,
	throwSubscriptionIdInUse,
} from "@/internal/billing/v2/common/errors/handleSubscriptionIdErrors";
import { customerProductRepo } from "@/internal/customers/cusProducts/repos";

const customerProductIdsReplacedByRequest = ({
	billingContext,
}: {
	billingContext: CreateScheduleBillingContext;
}) =>
	new Set([
		...billingContext.replacedScheduleCustomerProductIds,
		...billingContext.productContexts.flatMap(({ currentCustomerProduct }) =>
			currentCustomerProduct ? [currentCustomerProduct.id] : [],
		),
	]);

/**
 * subscription_id is unique within a phase; later phases may reuse it. An id on an
 * active row conflicts unless this request replaces that row, so a re-save works.
 */
export const handleSetPlansSubscriptionIdErrors = async ({
	ctx,
	billingContext,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
}) => {
	const phaseSubscriptionIds = [
		billingContext.productContexts.map(({ externalId }) => externalId),
		...billingContext.scheduledPhaseContexts.map(({ productContexts }) =>
			productContexts.map(({ externalId }) => externalId),
		),
	];
	for (const subscriptionIds of phaseSubscriptionIds) {
		assertNoDuplicateSubscriptionIds({ subscriptionIds });
	}

	const requestedSubscriptionIds = [
		...new Set(phaseSubscriptionIds.flat().filter((id): id is string => !!id)),
	];
	if (requestedSubscriptionIds.length === 0) return;

	const existing = await customerProductRepo.getByExternalIds({
		db: ctx.db,
		internalCustomerId: billingContext.fullCustomer.internal_id,
		externalIds: requestedSubscriptionIds,
	});
	const replacedIds = customerProductIdsReplacedByRequest({ billingContext });
	const conflict = existing.find(({ id }) => !replacedIds.has(id));

	if (conflict) {
		throwSubscriptionIdInUse({ subscriptionId: conflict.external_id });
	}
};
