import { timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import { clientCritical } from "@/db/initDrizzle.js";
import { getPgHealthState } from "@/db/pgHealthMonitor.js";
import { getRedisAvailability } from "@/external/redis/initRedis.js";
import type { HonoEnv } from "./HonoEnv.js";

const POSTGRES_TIMEOUT_MS = 1_000;
const READY_CHECK_TOKEN = process.env.READY_CHECK_TOKEN?.trim();

const checkPostgresReady = async () => {
	const query = clientCritical`SELECT 1`;
	let timeoutId: ReturnType<typeof setTimeout> | undefined;

	try {
		await Promise.race([
			query,
			new Promise<never>((_, reject) => {
				timeoutId = setTimeout(() => {
					void query.cancel();
					reject(new Error(`timed out after ${POSTGRES_TIMEOUT_MS}ms`));
				}, POSTGRES_TIMEOUT_MS);
			}),
		]);

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
	} finally {
		clearTimeout(timeoutId);
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
	const ok = postgres.ok;
	const status = ok ? 200 : 503;

	return c.json(
		{
			ok,
			checks: {
				postgres,
				redis,
			},
		},
		status,
	);
};
