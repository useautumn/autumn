import pino from "pino";
import { LOG_FLUSH_TIMEOUT_MS } from "../config.js";
import { createSazabiLogStream } from "../otlp/sazabiLogStream.js";
import {
	type ConsoleJsonStream,
	createConsoleJsonStream,
} from "../streams/consoleJsonStream.js";
import { createPrettyLogStream } from "../streams/prettyLogStream.js";
import type { CreateLoggerParams } from "../types.js";
import { normalizeErrorValues } from "./normalizeErrors.js";
import {
	resolveDeployment,
	resolveLoggerOptions,
} from "./resolveLoggerOptions.js";

type TransportStream = NodeJS.WritableStream & { writableEnded?: boolean };

const closeTransportStream = (stream: TransportStream) =>
	new Promise<void>((resolve) => {
		if (stream.writableEnded || !stream.writable) return resolve();
		const timer = setTimeout(resolve, LOG_FLUSH_TIMEOUT_MS);
		stream.once("close", () => {
			clearTimeout(timer);
			resolve();
		});
		stream.end();
	});

export const createLogger = (
	params: CreateLoggerParams,
): { flushTransports: () => Promise<void>; logger: pino.Logger } => {
	const resolved = resolveLoggerOptions({ options: params });
	const axiomToken = params.axiomToken ?? process.env.AXIOM_TOKEN;
	const axiomOrgId = params.axiomOrgId ?? process.env.AXIOM_ORG_ID;
	const streams: pino.StreamEntry[] = [];
	const transportStreams: TransportStream[] = [];
	const consoleJsonStreams: ConsoleJsonStream[] = [];

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
			const consoleJson = createConsoleJsonStream();
			consoleJsonStreams.push(consoleJson);
			streams.push({ level: resolved.level, stream: consoleJson });
		}

		if (output === "axiom" && axiomToken) {
			const transportStream = pino.transport({
				target: "@axiomhq/pino",
				options: {
					dataset: resolved.dataset,
					token: axiomToken,
					orgId: axiomOrgId,
				},
			});
			transportStreams.push(transportStream);
			streams.push({
				level: resolved.level,
				stream: transportStream,
			});
		}
	}

	const sazabi = createSazabiLogStream({ service: resolved.service });
	if (sazabi) streams.push(sazabi.entry);

	const logger = pino(
		{
			level: resolved.level,
			base: {
				deployment: resolveDeployment(),
				service: resolved.service,
				...(params.context ?? {}),
			},
			mixin: params.mixin,
			...(params.hooks && { hooks: params.hooks }),
			formatters: {
				level: (label: string) => ({ level: label.toUpperCase() }),
				log: (object: Record<string, unknown>) =>
					normalizeErrorValues(object) as Record<string, unknown>,
			},
		},
		pino.multistream(streams),
	);

	// Ending the transport is the only reliable flush: the Axiom target only
	let flushed: Promise<void> | undefined;
	const flushTransports = () => {
		flushed ??= Promise.all([
			...transportStreams.map(closeTransportStream),
			...consoleJsonStreams.map((stream) => stream.flush()),
			sazabi?.flush(),
		]).then(() => undefined);
		return flushed;
	};

	return { flushTransports, logger };
};
