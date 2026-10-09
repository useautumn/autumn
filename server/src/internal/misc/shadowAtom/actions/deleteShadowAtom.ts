import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { tearDownAtomRecord } from "@/internal/byoc/atomRecords/tearDownAtomRecord.js";
import { shadowAtomContext } from "../shadowAtomContext.js";
import { shadowAtomStorage } from "../shadowAtomStorage.js";
import { startShadowAtomWatch } from "../startShadowAtomWatch.js";
import { withShadowAtomLock } from "../withShadowAtomLock.js";
import { patchShadowAtomConfig } from "./patchShadowAtomConfig.js";

/** Tears our shadow Atom down, or retries a removal that stopped; its registered orgs are forgotten at once, as their folders go with it. */
export const deleteShadowAtom = ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<void> =>
	withShadowAtomLock({
		fn: async () => {
			const existing = await shadowAtomStorage.find();
			if (!existing) return;
			const remaining = await tearDownAtomRecord({
				ctx: shadowAtomContext(),
				record: existing,
			});
			await patchShadowAtomConfig({ patch: { orgs: {} } });
			if (remaining)
				await startShadowAtomWatch({
					ctx,
					deploymentGroupId: remaining.deployment_group_id,
				});
		},
	});
