import { BillingFeatureId } from "../billingFeatureIds";
import { ATOMS_LIMIT } from "../featureLimits";
import type { AtomAccess, AtomAccessReason } from "../types/atomAccess";
import type { FeatureAccessContext } from "../types/featureAccessContext";
import { hasFeature } from "./hasFeature";

const refusalReason = ({
	included,
	used,
}: {
	included: boolean;
	used: number;
}): AtomAccessReason | null => {
	if (!included) return "not_on_plan";
	if (used >= ATOMS_LIMIT) return "limit_reached";
	return null;
};

/** The org's Atom access; `countActive` counts the Atoms it runs now, which only the caller's store knows. */
export const atomAccess = async ({
	ctx,
	orgId,
	countActive,
}: {
	ctx: FeatureAccessContext;
	orgId: string;
	countActive: () => Promise<number>;
}): Promise<AtomAccess> => {
	const [included, used] = await Promise.all([
		hasFeature({ ctx, orgId, featureId: BillingFeatureId.Atoms }),
		countActive(),
	]);
	const reason = refusalReason({ included, used });
	return {
		included,
		limit: ATOMS_LIMIT,
		used,
		canCreate: reason === null,
		reason,
	};
};
