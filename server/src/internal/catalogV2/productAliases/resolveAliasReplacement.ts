import type { PlanAliasReplacement } from "@autumn/shared";

/** `claimedId` is someone else's (or this plan's own) alias — undefined if free. */
export const resolveAliasReplacement = ({
	claimedId,
	aliases,
}: {
	claimedId: string;
	aliases?: Record<string, string>;
}): PlanAliasReplacement | undefined => {
	const owner = aliases?.[claimedId];
	if (!owner) return undefined;
	return { alias_id: claimedId, plan_id: owner };
};
