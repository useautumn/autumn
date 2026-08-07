import { TrackParamsSchema } from "@autumn/shared";
import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import { primeRedisMonitor } from "@/external/redis/availabilityMonitor/redisAvailability.js";
import { primeRedisV2Monitor } from "@/external/redis/availabilityMonitor/redisV2Availability.js";
import { getTrackFeatureDeductionsForBody } from "@/internal/balances/track/utils/getFeatureDeductions.js";
import { runTrackWithRollout } from "@/internal/balances/track/runTrackWithRollout.js";
import { generateId } from "@/utils/genUtils.js";
import { createBenchmarkContext } from "./createBenchmarkContext.js";

const TRACK_OPCODE = 1;
const TRACK_RESULT_OPCODE = 2;
const ERROR_OPCODE = 3;
const port = Number(process.env.TRACK_WS_PORT ?? 8091);

await Promise.all([primeRedisMonitor(), primeRedisV2Monitor()]);
const baseCtx = await createBenchmarkContext();
const app = new Hono();
const { upgradeWebSocket, websocket } = createBunWebSocket();

app.get(
	"/",
	upgradeWebSocket(() => ({
		onMessage(event, ws) {
			void (async () => {
				let requestId: number | string = 0;
				try {
					const frame = JSON.parse(String(event.data));
					if (!Array.isArray(frame) || frame[0] !== TRACK_OPCODE) {
						throw new Error("unsupported opcode");
					}

					requestId = frame[1];
					const body = TrackParamsSchema.parse({
						customer_id: frame[2],
						feature_id: frame[3],
						value: frame[4],
						skip_event: true,
					});
					const ctx = {
						...baseCtx,
						id: generateId("ws_track"),
						timestamp: Date.now(),
						customerId: body.customer_id,
						entityId: body.entity_id,
						requestBody: body,
						extraLogs: {},
					};
					const featureDeductions = getTrackFeatureDeductionsForBody({
						ctx,
						body,
					});
					const response = await runTrackWithRollout({
						ctx,
						body,
						featureDeductions,
					});

					ws.send(
						JSON.stringify([
							TRACK_RESULT_OPCODE,
							requestId,
							response.balance?.remaining ?? null,
							response.balance?.usage ?? null,
						]),
					);
				} catch (error) {
					ws.send(
						JSON.stringify([
							ERROR_OPCODE,
							requestId,
							error instanceof Error ? error.message : String(error),
						]),
					);
				}
			})();
		},
	})),
);

Bun.serve({
	hostname: "127.0.0.1",
	port,
	fetch: app.fetch,
	websocket,
});

console.log(`Track WebSocket server listening on ws://127.0.0.1:${port}`);
