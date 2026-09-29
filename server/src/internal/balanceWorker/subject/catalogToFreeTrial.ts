import type { Catalog } from "@autumn/balance-engine";
import type { FreeTrial } from "@autumn/shared";

/** A product's trial from the worker's catalog; null when the row is gone. */
export const catalogToFreeTrial = ({
	catalog,
	freeTrialId,
}: {
	catalog: Catalog;
	freeTrialId: string | null | undefined;
}): FreeTrial | null => {
	const freeTrial = freeTrialId ? catalog.freeTrials[freeTrialId] : undefined;
	if (!freeTrial) return null;
	// The scope columns are catalog plumbing, not free_trials columns.
	const { org_id: _orgId, env: _env, ...row } = freeTrial;
	return row;
};
