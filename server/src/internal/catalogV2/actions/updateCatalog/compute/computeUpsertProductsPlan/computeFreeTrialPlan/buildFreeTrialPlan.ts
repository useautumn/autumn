import type { FreeTrial } from "@autumn/shared";
import type { FreeTrialPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

/** Claim lanes → FreeTrialPlan wire shape. */
export const buildFreeTrialPlan = ({
	claim,
}: {
	claim: {
		new?: FreeTrial | null;
		same?: FreeTrial | null;
		retired?: FreeTrial | null;
	};
}): FreeTrialPlan => {
	const next = claim.new ?? null;
	const same = claim.same ?? null;
	const retired = claim.retired ?? null;

	return {
		changed: Boolean(next || retired),
		new: next,
		same,
		retired,
		projected: next ?? same ?? null,
	};
};
