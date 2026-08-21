import { Hono } from "hono";
import type { PartitionWorker } from "./partitionWorker.js";

export const createMeteringHttpApp = ({
	worker,
}: {
	worker: PartitionWorker;
}): Hono => {
	const app = new Hono();

	app.get("/healthz", (c) =>
		c.json({ status: "ok", offset: worker.offset, epoch: worker.epoch }),
	);

	app.get("/check", (c) => {
		const customerId = c.req.query("customer_id");
		const featureId = c.req.query("feature_id");

		if (!customerId || !featureId) {
			return c.json({ error: "customer_id and feature_id are required" }, 400);
		}

		return c.json(worker.check({ customerId, featureId }));
	});

	return app;
};
