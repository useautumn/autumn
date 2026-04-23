import {
	ApiVersionClass,
	AppEnv,
	AuthType,
	LATEST_VERSION,
	type Organization,
	tryCatch,
} from "@autumn/shared";
import type { Context, Next } from "hono";
import { db, dbGeneral } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { resolveRedisV2 } from "@/external/redis/resolveRedisV2.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { generateId } from "@/utils/genUtils.js";
import { addRequestToLogs } from "@/utils/logging/addContextToLogs";
import { resolveCustomerId } from "./utils/resolveCustomerId.js";
import { resolveEntityId } from "./utils/resolveEntityId.js";

/**
 * Base middleware that sets up the request context
 * Sets up: db, logger, id, timestamp
 */
export const baseMiddleware = async (c: Context<HonoEnv>, next: Next) => {
	// const env = (c.req.header("app_env") as AppEnv) || AppEnv.Sandbox;
	const id =
		c.req.header("rndr-id") ||
		c.req.header("X-Amzn-Trace-Id") ||
		c.req.header("x-amzn-trace-id") ||
		generateId("local_req");

	const timestamp = Date.now();

	const { data: body } =
		c.req.method !== "GET" && c.req.method !== "HEAD"
			? await tryCatch(c.req.json())
			: { data: undefined };

	const customerId = resolveCustomerId({
		method: c.req.method,
		path: c.req.path,
		body,
		query: c.req.query(),
	});
	const entityId = resolveEntityId({
		method: c.req.method,
		path: c.req.path,
		body,
		query: c.req.query(),
	});

	const childLogger = addRequestToLogs({
		logger,
		requestContext: {
			id,
			method: c.req.method,
			url: c.req.url,
			timestamp,
			customer_id: customerId,
			entity_id: entityId,
			user_agent: c.req.header("user-agent"),
			ip_address: c.req.header("x-forwarded-for"),
			query: c.req.query(),
			body,

			name: `${c.req.method} ${c.req.path}`,
		},
	});

	// Set up the request context
	c.set("ctx", {
		// Core objects
		db,
		dbGeneral,
		logger: childLogger,
		redisV2: resolveRedisV2(),

		// Request info
		id,
		timestamp,
		isPublic: false,
		useReplicaDb: false,
		apiVersion: new ApiVersionClass(LATEST_VERSION),

		// Auth (will be populated by auth middleware)
		org: undefined as unknown as Organization,
		features: [],
		userId: undefined,
		customerId,
		entityId,
		authType: AuthType.Unknown,
		env: AppEnv.Sandbox, // maybe use app_env headers

		// Query params
		expand: [],
		skipCache: c.req.header("x-skip-cache") === "true",

		// Test params:
		extraLogs: {},

		testOptions: {
			eventId: c.req.header("x-event-id"),
			skipCacheDeletion: c.req.header("x-skip-cache-deletion") === "true",
			skipWebhooks: c.req.header("x-skip-webhooks") === "true",
			keepInternalFields: c.req.header("x-strip-internal") === "false",
			useReplica: c.req.header("x-use-replica") === "true",
		},
	});

	// childLogger.info(`${method} ${path}`);

	await next();
};
