// Minimal cluster exercising the real recycling modules without the app:
// two HTTP forks that recycle constantly under FORK_RECYCLE_* test settings.
import cluster from "node:cluster";
import http from "node:http";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import {
	attachPrimaryForkRecycling,
	startWorkerForkRecycling,
} from "@/utils/memory/forkRecycling/attachForkRecycling.js";

const PORT = Number(process.env.FIXTURE_PORT);
const log = (message: string) => console.log(message);
const fixtureLogger = { info: log, error: log, warn: log } as unknown as Logger;

if (cluster.isPrimary) {
	cluster.fork();
	cluster.fork();

	const forkRecycling = attachPrimaryForkRecycling({
		clusterModule: cluster,
		shouldRespawn: () => true,
		logger: fixtureLogger,
	});

	cluster.on("listening", (worker) => {
		console.log(`WORKER_UP ${worker.process.pid}`);
	});

	cluster.on("exit", (worker) => {
		if (forkRecycling.handleExit(worker)) return;
		console.log(`WORKER_DIED ${worker.process.pid}`);
	});
} else {
	const server = http.createServer((_req, res) => {
		// In-flight window so a hard kill mid-request would surface as a failure.
		setTimeout(() => {
			res.setHeader("connection", "keep-alive");
			res.end(`ok:${process.pid}`);
		}, 20);
	});

	server.listen(PORT, "127.0.0.1", () => {
		startWorkerForkRecycling({
			server,
			exitGracefully: () => process.exit(0),
			logger: fixtureLogger,
		});
	});
}
