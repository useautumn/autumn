import { timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import { clientCritical } from "@/db/initDrizzle.js";
import { getPgHealthState } from "@/db/pgHealthMonitor.js";
import { getRedisAvailability } from "@/external/redis/initRedis.js";
import { getRedisV2Availability } from "@/external/redis/initUtils/redisV2Availability.js";
import type { HonoEnv } from "./HonoEnv.js";

const POSTGRES_TIMEOUT_MS = 1_000;
const READY_CHECK_TOKEN = process.env.READY_CHECK_TOKEN?.trim();

const checkPostgresReady = async () => {
	try {
		await clientCritical.query({
			text: "SELECT 1",
			query_timeout: POSTGRES_TIMEOUT_MS,
		} as { text: string; query_timeout: number });

		return {
			ok: true,
			...getPgHealthState(),
		};
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : "unknown postgres error",
			...getPgHealthState(),
		};
	}
};

export const handleReadyCheck = async (c: Context<HonoEnv>) => {
	const providedToken = c.req.param("token");

	if (!READY_CHECK_TOKEN || !providedToken) return c.notFound();

	const expected = Buffer.from(READY_CHECK_TOKEN);
	const provided = Buffer.from(providedToken);

	if (
		expected.length !== provided.length ||
		!timingSafeEqual(expected, provided)
	) {
		return c.notFound();
	}

	const postgres = await checkPostgresReady();
	const redis = getRedisAvailability();
	const redisV2 = getRedisV2Availability();
	const ok = postgres.ok;
	const status = ok ? 200 : 503;

	return c.json(
		{
			ok,
			checks: {
				postgres,
				redis,
				redisV2,
			},
		},
		status,
	);
};
