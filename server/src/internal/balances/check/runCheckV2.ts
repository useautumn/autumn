import type { CheckResponseV3, ParsedCheckParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { CheckDataV2 } from "./checkTypes/CheckDataV2.js";
import { getCheckDataV2 } from "./getCheckDataV2.js";
import { getCheckResponseV2 } from "./getCheckResponseV2.js";
import { runCheckWithTrackV2 } from "./runCheckWithTrackV2.js";

type RunCheckV2Deps = {
	getCheckDataV2: typeof getCheckDataV2;
	getCheckResponseV2: typeof getCheckResponseV2;
	runCheckWithTrackV2: typeof runCheckWithTrackV2;
};

const defaultDeps: RunCheckV2Deps = {
	getCheckDataV2,
	getCheckResponseV2,
	runCheckWithTrackV2,
};

export const runCheckV2 = async ({
	ctx,
	body,
	requiredBalance,
	deps = defaultDeps,
}: {
	ctx: AutumnContext;
	body: ParsedCheckParams;
	requiredBalance: number;
	deps?: RunCheckV2Deps;
}): Promise<{
	checkData: CheckDataV2;
	response: CheckResponseV3;
}> => {
	const checkData = await deps.getCheckDataV2({
		ctx,
		body: body as ParsedCheckParams & { feature_id: string },
		requiredBalance,
	});

	const response =
		body.send_event || body.lock?.enabled
			? await deps.runCheckWithTrackV2({
					ctx,
					body,
					requiredBalance,
					checkData,
				})
			: await deps.getCheckResponseV2({
					checkData,
					requiredBalance,
				});

	return {
		checkData,
		response,
	};
};
