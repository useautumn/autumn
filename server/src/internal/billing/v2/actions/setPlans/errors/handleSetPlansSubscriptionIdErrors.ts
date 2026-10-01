import type { CreateScheduleBillingContext } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	assertNoDuplicateSubscriptionIds,
	presentSubscriptionIds,
	throwSubscriptionIdInUse,
} from "@/internal/billing/v2/common/errors/handleSubscriptionIdErrors";
import { customerProductRepo } from "@/internal/customers/cusProducts/repos";
import type { RequestedPhase } from "../timeline/desiredTimeline/types/requestedPhase";
import type { ResolvedSegment } from "../timeline/types/timelineDiff";
import type { SetPlansTimeline } from "../types/setPlansTimeline";

type Interval = { startsAt: number; endsAt: number | null };

const overlaps = ({ first, second }: { first: Interval; second: Interval }) =>
	(first.endsAt === null || first.endsAt > second.startsAt) &&
	(second.endsAt === null || second.endsAt > first.startsAt);

const segmentExternalId = ({
	segment,
	requestedPhases,
}: {
	segment: ResolvedSegment;
	requestedPhases: RequestedPhase[];
}) => {
	const source = segment.desired?.source;
	if (!source) return undefined;
	const phaseIndex = source.type === "ongoing" ? 0 : source.phaseIndex;
	return requestedPhases[phaseIndex]?.plans[source.planIndex]?.externalId;
};

/** An existing row keeps its subscription id while it runs; another instance may only claim it once it ends. */
const claimsRunningSubscriptionId = ({
	customerProductId,
	externalId,
	timeline,
}: {
	customerProductId: string;
	externalId: string;
	timeline: SetPlansTimeline;
}) => {
	const { timeline: segments } = timeline.diff;
	const carrying = segments.find((segment) =>
		segment.carriedBy?.rows.some(
			(row) => row.customerProductId === customerProductId,
		),
	);
	const inScope =
		!timeline.outOfScopeCustomerProductIds.includes(customerProductId);
	if (inScope && !carrying) return false;

	return segments.some(
		(segment) =>
			segment.key !== carrying?.key &&
			segmentExternalId({
				segment,
				requestedPhases: timeline.requestedPhases,
			}) === externalId &&
			(!carrying || overlaps({ first: segment, second: carrying })),
	);
};

/**
 * subscription_id is unique within a phase; later phases may reuse it. An id on an
 * existing row conflicts unless this request ends that row before another plan claims it.
 */
export const handleSetPlansSubscriptionIdErrors = async ({
	ctx,
	billingContext,
	timeline,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
	timeline: SetPlansTimeline;
}) => {
	const phaseSubscriptionIds = timeline.requestedPhases.map(({ plans }) =>
		presentSubscriptionIds(plans.map(({ externalId }) => externalId)),
	);
	for (const subscriptionIds of phaseSubscriptionIds) {
		assertNoDuplicateSubscriptionIds({ subscriptionIds });
	}

	const requestedSubscriptionIds = [...new Set(phaseSubscriptionIds.flat())];
	if (requestedSubscriptionIds.length === 0) return;

	const existing = await customerProductRepo.getByExternalIds({
		db: ctx.db,
		internalCustomerId: billingContext.fullCustomer.internal_id,
		externalIds: requestedSubscriptionIds,
	});
	const conflict = existing.find(
		({ id, external_id }) =>
			external_id !== null &&
			claimsRunningSubscriptionId({
				customerProductId: id,
				externalId: external_id,
				timeline,
			}),
	);

	if (conflict) {
		throwSubscriptionIdInUse({ subscriptionId: conflict.external_id });
	}
};
