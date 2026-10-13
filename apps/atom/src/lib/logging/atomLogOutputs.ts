import type { LoggerOutput } from "@autumn/logging";

export const atomLogOutputs = ({
	env,
}: {
	env: Record<string, string | undefined>;
}): LoggerOutput[] =>
	env.ATOM_PRETTY_LOGS === "true" ? ["console-pretty"] : ["console-json"];
