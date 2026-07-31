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
	"/v1/customers.get_or_create",
	"/v1/entities.get",
]);

// Event pages run to megabytes each, dwarfing every other route's ingest.
const RESPONSE_BODY_EXCLUDED_ROUTES = new Set<string>([
	"/v1/events/list",
	"/v1/events.list",
]);

// Read lazily: Infisical populates process.env in-process at runtime, so a
// module-scope read can land before the secret exists and silently pin this to 0.
let successLogSampleRate: number | undefined;
const getSuccessLogSampleRate = () => {
	successLogSampleRate ??= Number.parseFloat(
		process.env.AXIOM_SUCCESS_REQUEST_LOG_SAMPLE_RATE ?? "0",
	);
	return Number.isNaN(successLogSampleRate) ? 0 : successLogSampleRate;
};

const shouldSampleSuccessLog = () => {
	const rate = getSuccessLogSampleRate();
	return rate > 0 && Math.random() < Math.min(rate, 1);
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

		if (isHighVolumeSuccess && !shouldSampleSuccessLog()) {
			return;
		}

		ctx.logger = addExtrasToLogs({
			logger: ctx.logger,
			extras: ctx.extraLogs,
		});

		const skipResponseBody =
			isSuccess && RESPONSE_BODY_EXCLUDED_ROUTES.has(c.req.path);

		let finalResponseBody = skipResponseBody ? null : responseBody;
		if (finalResponseBody === undefined && c.req.path.includes("/v1")) {
			const contentType = c.res.headers.get("content-type");
			if (contentType?.includes("application/json")) {
				try {
					finalResponseBody = await c.res.clone().json();
				} catch (_error) {
					finalResponseBody = null;
				}
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
				// Serialized: response payloads carry arbitrary keys (feature IDs
				// etc.), each of which minted an Axiom field until events dropped.
				res: finalResponseBody ? JSON.stringify(finalResponseBody) : null,
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
