import type { AutumnLogger } from "@autumn/logging";
import { createTinybirdClient } from "../createTinybirdClient.js";
import { sendUsageEvents } from "./repos/usageEvents.js";
import type {
	EventsTinybird,
	EventsTinybirdConfig,
} from "./types/eventsTinybird.js";

const REQUEST_BUDGET_MS = 10_000;

export const createEventsTinybird = ({
	ctx,
	config,
}: {
	ctx: { logger: Pick<AutumnLogger, "error"> };
	config: EventsTinybirdConfig;
}): EventsTinybird => {
	const tinybird = createTinybirdClient({
		config: {
			region: config.region,
			timeoutMs: REQUEST_BUDGET_MS,
			fetch: config.fetch,
		},
	});
	const repoCtx = { tinybird, logger: ctx.logger };
	return {
		sendUsageEvents: ({ events }) => sendUsageEvents({ ctx: repoCtx, events }),
	};
};
