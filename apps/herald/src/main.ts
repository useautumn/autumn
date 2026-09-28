import { getHeraldEnv } from "@autumn/env/herald";
import { initInfisical } from "@autumn/shared/utils/infisical";
import {
	registerProcessSignals,
	startHerald,
	stopHerald,
} from "./lifecycle/heraldLifecycle.js";
import type {
	HeraldLifecycleContext,
	HeraldLifecycleState,
} from "./lifecycle/types/heraldLifecycle.js";
import { createHerald } from "./setup/createHerald.js";
import { getCatalogCache } from "./setup/getCatalogCache.js";
import { getEventsDb } from "./setup/getEventsDb.js";
import { getEventsTinybird } from "./setup/getEventsTinybird.js";
import { getHeraldEdgeConfigs } from "./setup/getHeraldEdgeConfigs.js";
import { getHeraldLogger } from "./setup/getHeraldLogger.js";
import { getMiscCache } from "./setup/getMiscCache.js";
import { getPostgres } from "./setup/getPostgres.js";
import { getSqsJobs } from "./setup/getSqsJobs.js";
import { getSvixClient } from "./setup/getSvixClient.js";

/** Inside the ECS stop timeout with room for the backstop to log and flush. */
const STOP_BUDGET_MS = 20_000;

async function main(): Promise<void> {
	await initInfisical();
	const logger = getHeraldLogger();
	const state: HeraldLifecycleState = { stopping: null };
	const herald = createHerald({
		ctx: {
			logger,
			eventsDb: getEventsDb(),
			eventsTinybird: getEventsTinybird(),
			svix: getSvixClient(),
			catalogCache: getCatalogCache(),
			postgres: getPostgres(),
			miscCache: getMiscCache(),
			sqsJobs: getSqsJobs(),
			edgeConfigs: getHeraldEdgeConfigs(),
			onConsumerCrashed,
		},
		config: { env: getHeraldEnv() },
	});
	const ctx: HeraldLifecycleContext = {
		herald,
		logger,
		exit: endProcess,
		stopBudgetMs: STOP_BUDGET_MS,
	};

	function onConsumerCrashed({
		job,
		cause,
	}: {
		job: string;
		cause: unknown;
	}): void {
		logger.error(
			{ error: cause, type: "herald_consumer_crashed", data: { job } },
			"Herald job's consumer died; exiting so the task is replaced",
		);
		void stopHerald({ ctx, state, reason: "consumer_crashed" });
	}

	registerProcessSignals({ ctx, state });
	await startHerald({ ctx, state });
}

function endProcess(code: number): void {
	process.exit(code);
}

async function run(): Promise<void> {
	try {
		await main();
	} catch (cause) {
		getHeraldLogger().error({ error: cause }, "Herald failed to boot");
		await getHeraldLogger().flush?.();
		process.exit(1);
	}
}

void run();
