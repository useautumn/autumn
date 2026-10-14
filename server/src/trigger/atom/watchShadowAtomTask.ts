import { idempotencyKeys, task, wait } from "@trigger.dev/sdk/v3";
import { z } from "zod/v4";
import { atomWatchIdempotencyKey } from "@/internal/byoc/atomRecords/watchAtomRecord/atomWatchIdempotencyKey.js";
import { watchAtomRecord } from "@/internal/byoc/atomRecords/watchAtomRecord/watchAtomRecord.js";
import { shadowAtomContext } from "@/internal/misc/shadowAtom/shadowAtomContext.js";

const WatchShadowAtomPayloadSchema = z.object({
	deploymentGroupId: z.string(),
});

type WatchShadowAtomPayload = z.infer<typeof WatchShadowAtomPayloadSchema>;

const WATCH_SHADOW_ATOM_TASK_ID = "watch-shadow-atom";

export const watchShadowAtomTask = task({
	id: WATCH_SHADOW_ATOM_TASK_ID,
	run: async (raw: WatchShadowAtomPayload) => {
		const { deploymentGroupId } = WatchShadowAtomPayloadSchema.parse(raw);
		const outcome = await watchAtomRecord({
			ctx: shadowAtomContext({ deploymentGroupId }),
			waitFor: wait.for,
		});
		await idempotencyKeys.reset(
			WATCH_SHADOW_ATOM_TASK_ID,
			await atomWatchIdempotencyKey({ deploymentGroupId }),
		);
		return { outcome };
	},
});
