import pino from "pino";
import { createConsoleJsonStream } from "../streams/consoleJsonStream.js";
import { createPrettyLogStream } from "../streams/prettyLogStream.js";
import type { CreateLoggerParams } from "../types.js";
import { resolveLoggerOptions } from "./resolveLoggerOptions.js";

export const createLogger = (params: CreateLoggerParams): pino.Logger => {
	const resolved = resolveLoggerOptions({ options: params });
	const axiomToken = params.axiomToken ?? process.env.AXIOM_TOKEN;
	const axiomOrgId = params.axiomOrgId ?? process.env.AXIOM_ORG_ID;
	const streams: pino.StreamEntry[] = [];

	for (const output of resolved.outputs) {
		if (output === "console-pretty") {
			streams.push({
				level: resolved.level,
				stream: createPrettyLogStream({
					trailingNewline: resolved.preset !== "dual",
					useConsoleLog: params.useConsoleLog ?? resolved.preset === "dual",
				}),
			});
		}

		if (output === "console-json") {
			streams.push({
				level: resolved.level,
				stream: createConsoleJsonStream(),
			});
		}

		if (output === "axiom" && axiomToken) {
			streams.push({
				level: resolved.level,
				stream: pino.transport({
					target: "@axiomhq/pino",
					options: {
						dataset: resolved.dataset,
						token: axiomToken,
						orgId: axiomOrgId,
					},
				}),
			});
		}
	}

	return pino(
		{
			level: resolved.level,
			base: {
				service: resolved.service,
				...(params.context ?? {}),
			},
			mixin: params.mixin,
			formatters: {
				level: (label: string) => ({ level: label.toUpperCase() }),
			},
		},
		pino.multistream(streams),
	);
};
