import {
	ApiVersionClass,
	AppEnv,
	AuthType,
	LATEST_VERSION,
} from "@autumn/shared";
import type { Context, Next } from "hono";
import { db } from "@/db/initDrizzle.js";
import { ClickHouseManager } from "@/external/clickhouse/ClickHouseManager.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { generateId } from "@/utils/genUtils.js";

/**
 * Base middleware that sets up the request context
 * Sets up: db, logger, clickhouseClient, id, timestamp
 */
export const baseMiddleware = async (c: Context<HonoEnv>, next: Next) => {
	// const env = (c.req.header("app_env") as AppEnv) || AppEnv.Sandbox;
	const id = c.req.header("rndr-id") || generateId("local_req");
	const timestamp = Date.now();

	const clickhouseClient = await ClickHouseManager.getClient();

	const reqContext = {
		id,
		// env: c.req.header("app_env") || undefined,
		method: c.req.method,
		url: c.req.url,
		timestamp,
	};

	// Create child logger
	const childLogger = logger.child({
		context: {
			req: reqContext,
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
	});

	const method = c.req.method;
	const path = c.req.path;

	let body = null;
	if (method === "POST" || method === "PUT" || method === "PATCH") {
		body = await c.req.json();
	}

	logger.info(`[HONO] ${method} ${path}`, {
		context: {
			body,
		},
	});

	await next();
};
