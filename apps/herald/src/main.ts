import { getHeraldEnv } from "@autumn/env/herald";
import { createHerald, type Herald } from "./setup/createHerald.js";
import { getEventsDb } from "./setup/getEventsDb.js";
import { getEventsTinybird } from "./setup/getEventsTinybird.js";
import { getHeraldLogger } from "./setup/getHeraldLogger.js";
import { getSvixClient } from "./setup/getSvixClient.js";

async function main(): Promise<void> {
	const logger = getHeraldLogger();
	const herald = createHerald({
		ctx: {
			logger,
			eventsDb: getEventsDb(),
			eventsTinybird: getEventsTinybird(),
			svix: getSvixClient(),
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
