import chalk from "chalk";
import type { Context } from "hono";
import type { AutumnContext, HonoEnv } from "@/honoUtils/HonoEnv.js";
import { addExtrasToLogs } from "@/utils/logging/addContextToLogs";
import { maskExtraLogs } from "@/utils/logging/maskExtraLogs.js";

const HIGH_VOLUME_SUCCESS_ROUTES = new Set<string>([
	// "/v1/balances.track",
	// "/v1/balances.check",
	// "/v1/check",
	// "/v1/track",
	// "/v1/customers.get_or_create",
	// "/v1/entities.get",
]);

const SUCCESS_REQUEST_LOG_SAMPLE_RATE = Number.parseFloat(
	process.env.AXIOM_SUCCESS_REQUEST_LOG_SAMPLE_RATE ?? "0",
);

const shouldSampleSuccessLog = () =>
	SUCCESS_REQUEST_LOG_SAMPLE_RATE > 0 &&
	Math.random() < Math.min(SUCCESS_REQUEST_LOG_SAMPLE_RATE, 1);

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

		let finalResponseBody = responseBody;
		if (
			!isSuccess &&
			finalResponseBody === undefined &&
			c.req.path.includes("/v1")
		) {
			const contentType = c.res.headers.get("content-type");
			if (contentType?.includes("application/json")) {
				try {
					const clonedResponse = c.res.clone();
					finalResponseBody = await clonedResponse.json();
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
				...(isSuccess ? {} : { res: finalResponseBody ?? null }),
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
