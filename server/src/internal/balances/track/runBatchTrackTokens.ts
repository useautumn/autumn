import type { BatchTrackTokensParams, TrackParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { runBatchTrackByRollout } from "./runBatchTrackByRollout.js";
import { getTokenTrackParams } from "./utils/getTokenTrackParams.js";

export const runBatchTrackTokens = async ({
	ctx,
	body,
}: {
	ctx: AutumnContext;
	body: BatchTrackTokensParams;
}): Promise<void> => {
	const trackBodies: TrackParams[] = [];

	for (const item of body) {
		const { body: trackBody } = await getTokenTrackParams({
			ctx,
			input: item,
		});
		trackBodies.push(trackBody);
	}

	await runBatchTrackByRollout({ ctx, body: trackBodies });
};
