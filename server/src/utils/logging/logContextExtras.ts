import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { maskExtraLogs } from "./maskExtraLogs.js";

export const logContextExtras = ({
	ctx,
	message,
	status,
}: {
	ctx: AutumnContext;
	message: string;
	status?: "success" | "error";
}) => {
	if (Object.keys(ctx.extraLogs).length === 0) return;

	const extras = maskExtraLogs(ctx.extraLogs);
	const log = status === "error" ? ctx.logger.warn : ctx.logger.info;
	log(message, { extras, status, done: true });

	if (process.env.NODE_ENV === "development") {
		ctx.logger.debug(`EXTRA LOGS: ${JSON.stringify(extras, null, 2)}`);
	}
};
