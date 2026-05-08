import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { addExtrasToLogs } from "@/utils/logging/addContextToLogs.js";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs.js";
import { maskExtraLogs } from "@/utils/logging/maskExtraLogs.js";

type MigrateCustomerLogResult = {
	status: "success" | "error";
	error?: unknown;
};

const getMigrationCustomerExtras = ({
	ctx,
}: {
	ctx: AutumnContext;
}): Record<string, unknown> => {
	const extras = ctx.extraLogs.migrationCustomer;
	return extras && typeof extras === "object" && !Array.isArray(extras)
		? extras
		: {};
};

export const logMigrateCustomerResult = ({
	ctx,
	result,
}: {
	ctx: AutumnContext;
	result: MigrateCustomerLogResult;
}) => {
	const durationMs = Date.now() - ctx.timestamp;
	const statusCode = result.status === "success" ? 200 : 500;

	addToExtraLogs({
		ctx,
		extras: {
			migrationCustomer: {
				...getMigrationCustomerExtras({ ctx }),
				status: result.status,
			},
		},
	});

	ctx.logger = addExtrasToLogs({
		logger: ctx.logger,
		extras: ctx.extraLogs,
	});

	const log = result.status === "success" ? ctx.logger.info : ctx.logger.warn;
	const statusColor = result.status === "success" ? chalk.green : chalk.yellow;

	log(
		`[${statusColor(statusCode)}] migrate customer ${ctx.customerId} (${ctx.org?.slug}) ${durationMs}ms`,
		{
			statusCode,
			durationMs,
			error:
				result.error instanceof Error
					? { name: result.error.name, message: result.error.message }
					: undefined,
		},
	);

	if (
		Object.keys(ctx.extraLogs).length > 0 &&
		process.env.NODE_ENV === "development"
	) {
		const maskedLogs = maskExtraLogs(ctx.extraLogs);
		ctx.logger.debug(`EXTRA LOGS: ${JSON.stringify(maskedLogs, null, 2)}`);
	}
};
