import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { tearDownAtomRecord } from "@/internal/byoc/atomRecords/tearDownAtomRecord.js";
import { shadowAtomContext } from "../shadowAtomContext.js";
import { shadowAtomRecordId } from "../shadowAtomNames.js";
import { findShadowAtomRecords } from "../shadowAtomStorage.js";
import { startShadowAtomWatch } from "../startShadowAtomWatch.js";
import { withShadowAtomLock } from "../withShadowAtomLock.js";
import { patchShadowAtomConfig } from "./patchShadowAtomConfig.js";

/** Tears the shadow Atom down, or with `atomId` retries an earlier one's stopped removal, as `deleteCache` does for an org's.
 * Deleting the current one forgets its registered orgs at once, as their folders go with it. */
export const deleteShadowAtom = ({
	ctx,
	atomId,
}: {
	ctx: AutumnContext;
	atomId?: string;
}): Promise<void> =>
	withShadowAtomLock({
		fn: async () => {
			const { current, previous } = await findShadowAtomRecords();
			const existing = atomId
				? [current, ...previous].find(
						(record) => record && shadowAtomRecordId({ record }) === atomId,
					)
				: current;
			if (!existing) return;
			const remaining = await tearDownAtomRecord({
				ctx: shadowAtomContext({
					deploymentGroupId: existing.deployment_group_id,
				}),
				record: existing,
			});
			if (existing === current)
				await patchShadowAtomConfig({ patch: { orgs: {} } });
			if (remaining)
				await startShadowAtomWatch({
					ctx,
					deploymentGroupId: remaining.deployment_group_id,
				});
		},
	});
