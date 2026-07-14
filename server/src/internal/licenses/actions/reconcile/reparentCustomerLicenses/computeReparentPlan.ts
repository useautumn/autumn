import type { DbCustomerLicense, FullCustomerLicense } from "@autumn/shared";
import type { ReconcileContext } from "../types.js";
import {
	findReparentCandidate,
	type SuccessorCandidate,
} from "./findReparentCandidate.js";

/**
 * One adoption: the stranded customer license is UPDATED to take the fresh
 * row's place (keeping its own id — the seats are anchored to it), and the
 * fresh row it replaces is DELETED (it was born empty with the new parent;
 * the unique (parent, license) index means it must vacate).
 */
export type ReparentOp = {
	strandedCustomerLicense: DbCustomerLicense;
	replacedFreshCustomerLicense: FullCustomerLicense;
};

export type ReparentPlan = { reparentOps: ReparentOp[] };

/** The position the stranded row takes over from the fresh row it replaces. */
export const reparentOpToUpdates = (op: ReparentOp) => ({
	parent_customer_product_id:
		op.replacedFreshCustomerLicense.parent_customer_product_id,
	license_internal_product_id:
		op.replacedFreshCustomerLicense.license_internal_product_id,
	plan_license_id: op.replacedFreshCustomerLicense.plan_license_id,
});

const toSuccessorCandidates = (
	context: ReconcileContext,
): SuccessorCandidate[] => {
	const parentById = new Map(
		context.parentCustomerProducts.map((parent) => [parent.id, parent]),
	);
	return context.customerLicenses.flatMap((customerLicense) => {
		const parent = parentById.get(customerLicense.parent_customer_product_id);
		return parent ? [{ customerLicense, parent }] : [];
	});
};

/**
 * Pure plan assembly: for each stranded customer license that still has
 * seats, find the fresh row under the parent that replaced its dead one, and
 * emit a ReparentOp pairing the two. Stranded rows with no seats, or with no
 * successor, get no op — the sweeps clean them up.
 */
export const computeReparentPlan = ({
	context,
}: {
	context: ReconcileContext;
}): ReparentPlan => {
	const successorCandidates = toSuccessorCandidates(context);
	const claimedCustomerLicenseIds = new Set<string>();
	const reparentOps: ReparentOp[] = [];

	for (const strandedCustomerLicense of context.strandedCustomerLicenses) {
		const seatCount =
			context.seatCountByCustomerLicenseId.get(
				strandedCustomerLicense.customerLicense.id,
			) ?? 0;
		if (seatCount === 0) continue;

		const successor = findReparentCandidate({
			strandedCustomerLicense,
			successorCandidates,
			claimedCustomerLicenseIds,
			seatCountByCustomerLicenseId: context.seatCountByCustomerLicenseId,
		});
		if (!successor) continue;

		claimedCustomerLicenseIds.add(successor.customerLicense.id);
		reparentOps.push({
			strandedCustomerLicense: strandedCustomerLicense.customerLicense,
			replacedFreshCustomerLicense: successor.customerLicense,
		});
	}
	return { reparentOps };
};
