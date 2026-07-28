import chalk from "chalk";
import type { Context } from "hono";
import type { AutumnContext, HonoEnv } from "@/honoUtils/HonoEnv.js";
import { addExtrasToLogs } from "@/utils/logging/addContextToLogs";
import { maskExtraLogs } from "@/utils/logging/maskExtraLogs.js";
import { writeFireLensRecord } from "@/utils/logging/writeFireLensRecord.js";
import { buildRequestResultRecords } from "./buildRequestResultRecords.js";
import { redactRequestBody } from "./redactRequestBody.js";

const isRequestLogArchiveDeployment = () =>
	process.env.FLIGHTCONTROL === "true" &&
	(process.env.FC_GIT_BRANCH === "dev" || process.env.FC_GIT_BRANCH === "main");

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

		ctx.logger = addExtrasToLogs({
			logger: ctx.logger,
			extras: ctx.extraLogs,
		});

		let finalResponseBody = responseBody;
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

		const records = buildRequestResultRecords({
			requestId: ctx.id,
			requestMethod: c.req.method,
			requestPath: c.req.path,
			requestBody: redactRequestBody({ body: ctx.requestBody }),
			orgId: ctx.org?.id ?? null,
			customerId: ctx.customerId ?? null,
			entityId: ctx.entityId ?? null,
			environment: ctx.env,
			eventTime: new Date(ctx.timestamp).toISOString(),
			statusCode,
			durationMs,
			responseBody: finalResponseBody ?? null,
			archiveSuccessResponse:
				isSuccess &&
				c.req.path.startsWith("/v1") &&
				isRequestLogArchiveDeployment(),
		});

		if (records.archive) {
			writeFireLensRecord({ record: records.archive });
		}

		const log = isSuccess ? ctx.logger.info : ctx.logger.warn;
		const statusColor = isSuccess ? chalk.green : chalk.yellow;

		log(
			`[${statusColor(statusCode)}] ${c.req.path} (${ctx.org?.slug}) ${durationMs}ms`,
			records.axiom,
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
