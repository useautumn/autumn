import type { FullCusProduct, FullCustomerLicense } from "@autumn/shared";
import { PHASE_BOUNDARY_TOLERANCE_MS } from "@/internal/billing/v2/utils/initFullCustomerProduct/findTransitionSourceCustomerProduct.js";
import type { StrandedCustomerLicense } from "../../../repos/customerLicenseRepo/listAdoptableStrandedCustomerLicenses.js";

/** A live parent's customer license, paired with that parent. The fresh,
 * empty ones (born with an attach or activation) are what stranded rows
 * replace. */
export type SuccessorCandidate = {
	customerLicense: FullCustomerLicense;
	parent: FullCusProduct;
};

/**
 * The successor a stranded customer license's seats should follow: a live
 * parent that replaced the dead one (same group, started when it ended —
 * phase-boundary adjacency) and offers the same license plan (public id, so
 * version bumps survive). Only fresh rows qualify — a row holding seats, or
 * one already claimed this run, is never replaced.
 */
export const findReparentCandidate = ({
	strandedCustomerLicense,
	successorCandidates,
	claimedCustomerLicenseIds,
	seatCountByCustomerLicenseId,
}: {
	strandedCustomerLicense: StrandedCustomerLicense;
	successorCandidates: SuccessorCandidate[];
	claimedCustomerLicenseIds: Set<string>;
	seatCountByCustomerLicenseId: Map<string, number>;
}): SuccessorCandidate | undefined => {
	const { parentEndedAt, parentGroup, licensePlanId } = strandedCustomerLicense;

	return successorCandidates.find(({ customerLicense, parent }) => {
		const offersSameLicensePlan =
			customerLicense.license?.license_plan_id === licensePlanId;

		const inSameGroup = parent.product.group === parentGroup;

		const replacedDeadParent =
			Math.abs(parent.starts_at - parentEndedAt) <= PHASE_BOUNDARY_TOLERANCE_MS;

		const hasNoSeats =
			(seatCountByCustomerLicenseId.get(customerLicense.id) ?? 0) === 0;

		const notYetClaimed = !claimedCustomerLicenseIds.has(customerLicense.id);

		return (
			offersSameLicensePlan &&
			inSameGroup &&
			replacedDeadParent &&
			hasNoSeats &&
			notYetClaimed
		);
	});
};
