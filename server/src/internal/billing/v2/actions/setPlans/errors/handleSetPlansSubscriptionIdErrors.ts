import type { CreateScheduleBillingContext } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	assertNoDuplicateSubscriptionIds,
	presentSubscriptionIds,
	throwSubscriptionIdInUse,
} from "@/internal/billing/v2/common/errors/handleSubscriptionIdErrors";
import { customerProductRepo } from "@/internal/customers/cusProducts/repos";
import { resolveSetPlansRecurringProducts } from "../utils/resolveSetPlansRecurringProducts";

type RequestedPhase = {
	startsAt: number | undefined;
	subscriptionIds: string[];
};

const customerProductEndsByRequest = ({
	billingContext,
}: {
	billingContext: CreateScheduleBillingContext;
}) => {
	const { recurringOutgoing, recurringEndingAtPhase } =
		resolveSetPlansRecurringProducts({ billingContext });

	const endsNowIds = new Set([
		...billingContext.replacedScheduleCustomerProductIds,
		...billingContext.productContexts.flatMap(({ currentCustomerProduct }) =>
			currentCustomerProduct ? [currentCustomerProduct.id] : [],
		),
		...recurringOutgoing.map(({ id }) => id),
	]);
	const endsAtById = new Map(
		recurringEndingAtPhase.map(({ customerProduct, endsAt }) => [
			customerProduct.id,
			endsAt,
		]),
	);

	return ({
		customerProductId,
		phase,
	}: {
		customerProductId: string;
		phase: RequestedPhase;
	}) => {
		if (endsNowIds.has(customerProductId)) return true;
		const endsAt = endsAtById.get(customerProductId);
		if (endsAt === undefined || phase.startsAt === undefined) return false;
		return endsAt <= phase.startsAt;
	};
};

/**
 * subscription_id is unique within a phase; later phases may reuse it. An id on an
 * existing row conflicts unless this request ends that row by the claiming phase's start.
 */
export const handleSetPlansSubscriptionIdErrors = async ({
	ctx,
	billingContext,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
}) => {
	const requestedPhases: RequestedPhase[] = [
		{
			startsAt: undefined,
			subscriptionIds: presentSubscriptionIds(
				billingContext.productContexts.map(({ externalId }) => externalId),
			),
		},
		...billingContext.scheduledPhaseContexts.map(
			({ startsAt, productContexts }) => ({
				startsAt,
				subscriptionIds: presentSubscriptionIds(
					productContexts.map(({ externalId }) => externalId),
				),
			}),
		),
	];
	for (const { subscriptionIds } of requestedPhases) {
		assertNoDuplicateSubscriptionIds({ subscriptionIds });
	}

	const requestedSubscriptionIds = [
		...new Set(
			requestedPhases.flatMap(({ subscriptionIds }) => subscriptionIds),
		),
	];
	if (requestedSubscriptionIds.length === 0) return;

	const existing = await customerProductRepo.getByExternalIds({
		db: ctx.db,
		internalCustomerId: billingContext.fullCustomer.internal_id,
		externalIds: requestedSubscriptionIds,
	});
	const endsByPhase = customerProductEndsByRequest({ billingContext });
	const conflict = existing.find(({ id, external_id }) =>
		requestedPhases.some(
			(phase) =>
				external_id !== null &&
				phase.subscriptionIds.includes(external_id) &&
				!endsByPhase({ customerProductId: id, phase }),
		),
	);

	if (conflict) {
		throwSubscriptionIdInUse({ subscriptionId: conflict.external_id });
	}
};
