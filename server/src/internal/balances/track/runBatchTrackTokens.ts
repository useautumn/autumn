import type { BatchTrackTokensParams, TrackParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { TokenDeduction } from "../utils/types/featureDeduction.js";
import { runBatchTrackByRollout } from "./runBatchTrackByRollout.js";
import { getTokenTrackParams } from "./utils/getTokenTrackParams.js";
import { findTokenDeduction } from "./utils/tokenFeatureDeduction.js";

export const runBatchTrackTokens = async ({
	ctx,
	body,
}: {
	ctx: AutumnContext;
	body: BatchTrackTokensParams;
}): Promise<void> => {
	const trackBodies: TrackParams[] = [];
	const tokens: (TokenDeduction | undefined)[] = [];

	for (const item of body) {
		const { body: trackBody, featureDeductions } = await getTokenTrackParams({
			ctx,
			input: item,
		});
		trackBodies.push(trackBody);
		tokens.push(findTokenDeduction({ featureDeductions }));
	}

	await runBatchTrackByRollout({ ctx, body: trackBodies, tokens });
};
