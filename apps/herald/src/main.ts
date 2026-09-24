import { getHeraldEnv } from "@autumn/env/herald";
import { initInfisical } from "@autumn/shared/utils/infisical";
import { createHerald, type Herald } from "./setup/createHerald.js";
import { getCatalogCache } from "./setup/getCatalogCache.js";
import { getEventsDb } from "./setup/getEventsDb.js";
import { getEventsTinybird } from "./setup/getEventsTinybird.js";
import { getHeraldEdgeConfigs } from "./setup/getHeraldEdgeConfigs.js";
import { getHeraldLogger } from "./setup/getHeraldLogger.js";
import { getMiscCache } from "./setup/getMiscCache.js";
import { getPostgres } from "./setup/getPostgres.js";
import { getSvixClient } from "./setup/getSvixClient.js";

async function main(): Promise<void> {
	await initInfisical();
	const logger = getHeraldLogger();
	const herald = createHerald({
		ctx: {
			logger,
			eventsDb: getEventsDb(),
			eventsTinybird: getEventsTinybird(),
			svix: getSvixClient(),
			catalogCache: getCatalogCache(),
			postgres: getPostgres(),
			miscCache: getMiscCache(),
			edgeConfigs: getHeraldEdgeConfigs(),
		},
		config: { env: getHeraldEnv() },
	});
	registerShutdownSignals({ herald });
	await herald.start();
}

function registerShutdownSignals({ herald }: { herald: Herald }): void {
	async function shutdown(): Promise<void> {
		try {
			await herald.stop();
		} finally {
			process.exit(0);
		}
	}
	function onSignal(): void {
		void shutdown();
	}
	process.once("SIGINT", onSignal);
	process.once("SIGTERM", onSignal);
}

async function run(): Promise<void> {
	try {
		await main();
	} catch (cause) {
		getHeraldLogger().error({ error: cause }, "Herald failed to start");
		process.exit(1);
	}
}

void run();
