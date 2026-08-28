import { Hono } from "hono";
import { z } from "zod/v4";
import { buildShadowEvent } from "../shadow/shadowEvent.js";
import type { PartitionWorker } from "./partitionWorker.js";

/** Same field names the API-side shadow tap already speaks, so a routed track
 *  and its mirrored twin derive the same event id and the fold dedupes one of
 *  them instead of double-counting. */
export const workerTrackRequestSchema = z.object({
	org_id: z.string().min(1),
	env: z.string().min(1),
	customer_id: z.string().min(1),
	feature_id: z.string().min(1),
	value: z.number().finite().positive(),
	idempotency_key: z.string().min(1),
});

export const createMeteringHttpApp = ({
	worker,
}: {
	worker: PartitionWorker;
}): Hono => {
	const app = new Hono();

	const catchingUpBody = () => ({
		error: "worker_catching_up",
		offset: worker.offset,
		target_offset: worker.targetOffset,
		epoch: worker.epoch,
	});

	app.get("/healthz", (c) => {
		if (!worker.isReady) {
			return c.json(
				{ ...catchingUpBody(), status: "catching_up" as const },
				503,
			);
		}
		return c.json({ status: "ok", offset: worker.offset, epoch: worker.epoch });
	});

	app.post("/catch-up", async (c) => {
		try {
			await worker.captureHighWatermark();
			if (worker.isReady) {
				return c.json({
					status: "ok" as const,
					offset: worker.offset,
					target_offset: worker.targetOffset,
					epoch: worker.epoch,
				});
			}
			return c.json(
				{ ...catchingUpBody(), status: "catching_up" as const },
				202,
			);
		} catch (error) {
			return c.json(
				{
					error:
						error instanceof Error
							? error.message
							: "high watermark unavailable",
				},
				502,
			);
		}
	});

	app.get("/check", (c) => {
		if (!worker.isReady) return c.json(catchingUpBody(), 503);

		const orgId = c.req.query("org_id");
		const env = c.req.query("env");
		const customerId = c.req.query("customer_id");
		const featureId = c.req.query("feature_id");

		if (!orgId || !env || !customerId || !featureId) {
			return c.json(
				{ error: "org_id, env, customer_id and feature_id are required" },
				400,
			);
		}

		return c.json(worker.check({ orgId, env, customerId, featureId }));
	});

	app.post("/track", async (c) => {
		if (!worker.isReady) return c.json(catchingUpBody(), 503);

		const raw = await c.req.json().catch(() => null);
		const parsed = workerTrackRequestSchema.safeParse(raw);

		if (!parsed.success) {
			return c.json({ error: "invalid track body" }, 400);
		}

		const { org_id, env, customer_id, feature_id, value, idempotency_key } =
			parsed.data;

		const event = buildShadowEvent({
			type: "deduct",
			orgId: org_id,
			env,
			customerId: customer_id,
			featureId: feature_id,
			value,
			idempotencyKey: idempotency_key,
		});
		if (!event) return c.json({ error: "invalid track body" }, 400);

		try {
			return c.json(await worker.command({ event }));
		} catch (error) {
			// The append never acked, so nothing was folded: telling the caller the
			// write failed is what lets it fall back to Redis.
			return c.json(
				{ error: error instanceof Error ? error.message : "append failed" },
				502,
			);
		}
	});

	return app;
};
