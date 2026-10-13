import type { LoggerLevel } from "../types.js";

export const SEVERITY_NUMBERS: Record<string, number> = {
	TRACE: 1,
	DEBUG: 5,
	INFO: 9,
	WARN: 13,
	ERROR: 17,
	FATAL: 21,
};

export const sazabiLogLevelOf = ({
	env,
}: {
	env: NodeJS.ProcessEnv;
}): LoggerLevel => (env.SAZABI_LOG_LEVEL as LoggerLevel | undefined) ?? "warn";

/** The intake URL with no trailing slash, or undefined when Sazabi is off; dev/test need SAZABI_DEV_LOGS=1. */
export const sazabiIntakeUrlOf = ({
	env,
}: {
	env: NodeJS.ProcessEnv;
}): string | undefined => {
	const intakeUrl = env.SAZABI_INTAKE_URL?.replace(/\/+$/, "");
	if (!intakeUrl) return undefined;
	const isDevOrTest = env.NODE_ENV === "development" || env.NODE_ENV === "test";
	if (isDevOrTest && env.SAZABI_DEV_LOGS !== "1") return undefined;
	return intakeUrl;
};
