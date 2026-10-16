import { BillingFeatureId } from "../billingFeatureIds";
import { ATOMS_LIMIT } from "../featureLimits";
import type { AtomLimits, AtomLimitsReason } from "../types/atomLimits";
import type { FeatureAccessContext } from "../types/featureAccessContext";
import { hasFeature } from "./hasFeature";

const refusalReason = ({
	included,
	used,
}: {
	included: boolean;
	used: number;
}): AtomLimitsReason | null => {
	if (!included) return "not_on_plan";
	if (used >= ATOMS_LIMIT) return "limit_reached";
	return null;
};

/** Decides whether the org can create another Atom: Atoms are on its plan and it runs fewer than the limit. */
export const getAtomLimits = async ({
	ctx,
	orgId,
	activeAtoms,
}: {
	ctx: FeatureAccessContext;
	orgId: string;
	activeAtoms: number;
}): Promise<AtomLimits> => {
	const included = await hasFeature({
		ctx,
		orgId,
		featureId: BillingFeatureId.Atoms,
	});
	const reason = refusalReason({ included, used: activeAtoms });
	return {
		included,
		limit: ATOMS_LIMIT,
		used: activeAtoms,
		canCreate: reason === null,
		reason,
	};
};
