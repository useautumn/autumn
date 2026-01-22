import {
	ApiVersionClass,
	AppEnv,
	AuthType,
	LATEST_VERSION,
	tryCatch,
} from "@autumn/shared";
import type { Context, Next } from "hono";
import { db } from "@/db/initDrizzle.js";
import { ClickHouseManager } from "@/external/clickhouse/ClickHouseManager.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { generateId } from "@/utils/genUtils.js";
import { addRequestToLogs } from "@/utils/logging/addContextToLogs";

/**
 * Base middleware that sets up the request context
 * Sets up: db, logger, clickhouseClient, id, timestamp
 */
export const baseMiddleware = async (c: Context<HonoEnv>, next: Next) => {
	// const env = (c.req.header("app_env") as AppEnv) || AppEnv.Sandbox;
	const id =
		c.req.header("rndr-id") ||
		c.req.header("X-Amzn-Trace-Id") ||
		c.req.header("x-amzn-trace-id") ||
		generateId("local_req");

	const timestamp = Date.now();

	const clickhouseClient = await ClickHouseManager.getClient();

	const { data: body } = await tryCatch(c.req.json());

	const childLogger = addRequestToLogs({
		logger,
		requestContext: {
			id,
			method: c.req.method,
			url: c.req.url,
			timestamp,
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
		logger: childLogger,
		clickhouseClient,

		// Request info
		id,
		timestamp,
		isPublic: false,
		apiVersion: new ApiVersionClass(LATEST_VERSION),

		// Auth (will be populated by auth middleware)
		org: undefined as any,
		features: [],
		userId: undefined,
		authType: AuthType.Unknown,
		env: AppEnv.Sandbox, // maybe use app_env headers

		// Query params
		expand: [],
		skipCache: false,

		// Test params:
		extraLogs: {},

		testOptions: {
			skipCacheDeletion: c.req.header("x-skip-cache-deletion") === "true",
			skipWebhooks: c.req.header("x-skip-webhooks") === "true",
		},
	});

	// childLogger.info(`${method} ${path}`);

	await next();
};
