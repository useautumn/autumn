import type { AutumnLogger } from "@autumn/logging";
import { classifyError } from "../classify/classifyError.js";
import { kindToReportPolicy } from "./reportPolicy.js";

const errorMessageOf = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

export const reportError = ({
	ctx,
	error,
	operation,
}: {
	ctx: { logger: Pick<AutumnLogger, "warn" | "error"> };
	error: unknown;
	operation: string;
}): void => {
	const { kind } = classifyError({ error });
	const { logLevel } = kindToReportPolicy({ kind });

	ctx.logger[logLevel](`${operation} failed: ${errorMessageOf(error)}`, {
		error,
	});
};
