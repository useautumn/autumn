import chalk from "chalk";
import type { Context } from "hono";
import type { AutumnContext, HonoEnv } from "@/honoUtils/HonoEnv.js";
import { addExtrasToLogs } from "@/utils/logging/addContextToLogs.js";
import { maskExtraLogs } from "@/utils/logging/maskExtraLogs.js";

const HIGH_VOLUME_SUCCESS_ROUTES = new Set<string>([
	"/v1/balances.track",
	"/v1/balances.check",
	"/v1/check",
	"/v1/track",
	"/v1/entities.get",
	"/v1/customers.get",
	"/v1/customers.get_or_create",
	"/v1/events.aggregate",
	"/v1/plans.list",
]);

const SLOW_REQUEST_BODY_THRESHOLD_MS = 500;
const SUCCESS_RESPONSE_BODY_SAMPLE_RATE = 0.01;
const MAX_LOGGED_RESPONSE_BODY_BYTES = 32 * 1024;

const LIST_RESPONSE_ROUTES = new Set<string>([
	"/v1/events.aggregate",
	"/v1/plans.list",
]);

// Event pages run to megabytes each, dwarfing every other route's ingest.
const RESPONSE_BODY_EXCLUDED_ROUTES = new Set<string>([
	"/v1/events/list",
	"/v1/events.list",
]);

const shouldSampleSuccessResponseBody = () =>
	Math.random() < SUCCESS_RESPONSE_BODY_SAMPLE_RATE;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const stripLargeFields = (value: unknown) => {
	if (!isRecord(value)) return value;
	const compactValue = { ...value };
	delete compactValue.breakdown;
	delete compactValue.feature;
	delete compactValue.rollovers;
	return compactValue;
};

const compactHighVolumeResponseBody = ({
	path,
	responseBody,
}: {
	path: string;
	responseBody: Record<string, unknown>;
}) => {
	const compactResponseBody = { ...responseBody };
	delete compactResponseBody.preview;
	if ("balance" in compactResponseBody) {
		compactResponseBody.balance = stripLargeFields(responseBody.balance);
	}
	if (isRecord(responseBody.balances)) {
		compactResponseBody.balances = Object.fromEntries(
			Object.entries(responseBody.balances).map(([featureId, balance]) => [
				featureId,
				stripLargeFields(balance),
			]),
		);
	}
	if ("flag" in compactResponseBody) {
		compactResponseBody.flag = stripLargeFields(responseBody.flag);
	}
	if (Array.isArray(responseBody.subscriptions)) {
		compactResponseBody.subscriptions_count = responseBody.subscriptions.length;
		delete compactResponseBody.subscriptions;
	}
	if (Array.isArray(responseBody.purchases)) {
		compactResponseBody.purchases_count = responseBody.purchases.length;
		delete compactResponseBody.purchases;
	}
	if (LIST_RESPONSE_ROUTES.has(path) && Array.isArray(responseBody.list)) {
		compactResponseBody.list_count = responseBody.list.length;
		delete compactResponseBody.list;
	}
	if (
		path === "/v1/events.aggregate" &&
		Array.isArray(responseBody.deductions)
	) {
		compactResponseBody.deductions_count = responseBody.deductions.length;
		delete compactResponseBody.deductions;
	}
	return compactResponseBody;
};

export const logRequestResult = async ({
	ctx,
	c,
	durationMs = Date.now() - ctx.timestamp,
	skipUrls = [],
	statusCode = c.res.status,
	responseBody,
}: {
	ctx: AutumnContext;
	c: Context<HonoEnv>;
	durationMs?: number;
	skipUrls?: string[];
	statusCode?: number;
	responseBody?: Record<string, unknown> | null;
}) => {
	try {
		if (skipUrls.includes(c.req.path)) {
			return;
		}

		const isSuccess = statusCode >= 200 && statusCode < 300;
		const isHighVolumeSuccess =
			isSuccess && HIGH_VOLUME_SUCCESS_ROUTES.has(c.req.path);

		ctx.logger = addExtrasToLogs({
			logger: ctx.logger,
			extras: ctx.extraLogs,
		});

		const excludeResponseBody =
			isSuccess && RESPONSE_BODY_EXCLUDED_ROUTES.has(c.req.path);
		const compactResponseBody =
			isHighVolumeSuccess &&
			durationMs < SLOW_REQUEST_BODY_THRESHOLD_MS &&
			!shouldSampleSuccessResponseBody();

		let originalResponseBodyBytes: number | undefined;
		let responseBodyWasCompacted = false;
		let finalResponseBody = excludeResponseBody ? null : responseBody;
		if (
			!excludeResponseBody &&
			finalResponseBody === undefined &&
			c.req.path.includes("/v1")
		) {
			const contentType = c.res.headers.get("content-type");
			if (contentType?.includes("application/json")) {
				try {
					const responseText = await c.res.clone().text();
					originalResponseBodyBytes = Buffer.byteLength(responseText);
					finalResponseBody = JSON.parse(responseText);
				} catch (_error) {
					finalResponseBody = null;
				}
			}
		}

		if (compactResponseBody && isRecord(finalResponseBody)) {
			finalResponseBody = compactHighVolumeResponseBody({
				path: c.req.path,
				responseBody: finalResponseBody,
			});
			responseBodyWasCompacted = true;
		}

		if (isRecord(finalResponseBody)) {
			const loggedResponseBodyBytes =
				originalResponseBodyBytes === undefined ||
				(responseBodyWasCompacted &&
					originalResponseBodyBytes > MAX_LOGGED_RESPONSE_BODY_BYTES)
					? Buffer.byteLength(JSON.stringify(finalResponseBody))
					: originalResponseBodyBytes;
			if (loggedResponseBodyBytes > MAX_LOGGED_RESPONSE_BODY_BYTES) {
				finalResponseBody = {
					truncated: true,
					original_bytes: originalResponseBodyBytes ?? loggedResponseBodyBytes,
					top_level_keys: Object.keys(finalResponseBody),
				};
			}
		}

		const log = isSuccess ? ctx.logger.info : ctx.logger.warn;
		const statusColor = isSuccess ? chalk.green : chalk.yellow;

		log(
			`[${statusColor(statusCode)}] ${c.req.path} (${ctx.org?.slug}) ${durationMs}ms`,
			{
				statusCode,
				durationMs,
				...(ctx.requestLogContext === undefined
					? {}
					: { req: ctx.requestLogContext }),
				res: finalResponseBody ?? null,
			},
		);

		if (
			Object.keys(ctx.extraLogs).length > 0 &&
			process.env.NODE_ENV === "development"
		) {
			const maskedLogs = maskExtraLogs(ctx.extraLogs);
			ctx.logger.debug(`EXTRA LOGS: ${JSON.stringify(maskedLogs, null, 2)}`);
		}
	} catch (error) {
		console.error("Failed to log response to logtail");
		console.error(error);
	}
};
