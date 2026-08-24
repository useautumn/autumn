import { type Feature, FeatureNotFoundError } from "@autumn/shared";
import type { Command } from "../../../api/types/command.js";
import { LedgerNotImplementedError } from "../../../lib/ledgerNotImplementedError.js";
import { featureStore } from "../../../sqlite/features/store/featureStore.js";
import type { SqliteContext } from "../../../sqlite/common/types/sqliteContext.js";

// Rows 5-6: the feature_id branch. The event_name fan-out (row 7) and credit
// systems (row 40) widen this set; every later phase reads it, not the body.
export const setupFeatureContext = ({
	ctx,
	command,
}: {
	ctx: SqliteContext;
	command: Command;
}): Feature[] => {
	const featureId = command.body.feature_id;
	if (!featureId) throw new LedgerNotImplementedError("event_name deductions");

	const feature = featureStore.getByFeatureId({
		ctx,
		orgId: command.org_id,
		env: command.env,
		featureId,
	});
	if (!feature) throw new FeatureNotFoundError({ featureId });

	return [feature];
};
