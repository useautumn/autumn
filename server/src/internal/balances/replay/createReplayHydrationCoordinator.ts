import {
	closeScope,
	runCheck,
	runPrewarm,
	runTrack,
} from "./coordinator/replayHydrationRequests.js";
import { createReplayHydrationScope } from "./coordinator/replayHydrationScope.js";
import type {
	ReplayHydrationClock,
	ReplayHydrationConfig,
	ReplayHydrationCoordinator,
	ReplayHydrationSource,
	ReplayHydrationWorkerClient,
} from "./replayHydrationContracts.js";

export function createReplayHydrationCoordinator({
	source,
	client,
	config = {},
	clock,
}: {
	source: ReplayHydrationSource;
	client: ReplayHydrationWorkerClient;
	config?: ReplayHydrationConfig;
	clock?: ReplayHydrationClock;
}): ReplayHydrationCoordinator {
	const scope = createReplayHydrationScope({ source, client, config, clock });
	return {
		check: (params) => runCheck({ scope, ...params }),
		track: (params) => runTrack({ scope, ...params }),
		prewarm: (params) => runPrewarm({ scope, ...params }),
		close: () => closeScope({ scope }),
	};
}
