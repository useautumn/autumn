import type {
	BalanceHydrationClock,
	BalanceHydrationConfig,
	BalanceHydrationCoordinator,
	BalanceHydrationSource,
	BalanceHydrationWorkerClient,
} from "./balanceHydrationContracts.js";
import {
	closeScope,
	runCheck,
	runPrewarm,
	runTrack,
} from "./coordinator/balanceHydrationRequests.js";
import { createBalanceHydrationScope } from "./coordinator/balanceHydrationScope.js";

export function createBalanceHydrationCoordinator({
	source,
	client,
	config = {},
	clock,
}: {
	source: BalanceHydrationSource;
	client: BalanceHydrationWorkerClient;
	config?: BalanceHydrationConfig;
	clock?: BalanceHydrationClock;
}): BalanceHydrationCoordinator {
	const scope = createBalanceHydrationScope({ source, client, config, clock });
	return {
		check: (params) => runCheck({ scope, ...params }),
		track: (params) => runTrack({ scope, ...params }),
		prewarm: (params) => runPrewarm({ scope, ...params }),
		close: () => closeScope({ scope }),
	};
}
