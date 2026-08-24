import {
	createSubjectEventConsumer,
	PROJECTOR_GROUP_ID,
} from "./external/redpanda/createSubjectEventConsumer.js";
import { runProjector } from "./internal/projector/runProjector.js";
import { env, kafkaBrokers } from "./lib/env.js";
import { getPostgres } from "./lib/getPostgres.js";
import { logger } from "./lib/logger.js";

const brokers = kafkaBrokers();
if (brokers.length === 0) {
	logger.error("Ledger projector needs LEDGER_KAFKA_BROKERS", {
		event: "ledger.projector_misconfigured",
	});
	process.exit(1);
}

const consumer = createSubjectEventConsumer({
	ctx: {
		brokers,
		clientId: `${env.LEDGER_KAFKA_CLIENT_ID}-projector`,
		logger,
	},
	groupId: PROJECTOR_GROUP_ID,
});

await runProjector({ ctx: { postgres: getPostgres(), logger }, consumer });

let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, () => {
		if (shuttingDown) return;
		shuttingDown = true;
		void (async () => {
			logger.info("Ledger projector shutting down", {
				event: "ledger.projector_stopping",
				data: { signal },
			});
			await consumer.stop();
			await logger.flush?.().catch(() => undefined);
			process.exit(signal === "SIGTERM" ? 143 : 130);
		})();
	});
}
