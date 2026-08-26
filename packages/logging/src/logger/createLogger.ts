import pino from "pino";
import { createConsoleJsonStream } from "../streams/consoleJsonStream.js";
import { createPrettyLogStream } from "../streams/prettyLogStream.js";
import type { CreateLoggerParams } from "../types.js";
import {
	resolveDeployment,
	resolveLoggerOptions,
} from "./resolveLoggerOptions.js";

const TRANSPORT_FLUSH_TIMEOUT_MS = 2000;

type TransportStream = NodeJS.WritableStream & { writableEnded?: boolean };

const closeTransportStream = (stream: TransportStream) =>
	new Promise<void>((resolve) => {
		if (stream.writableEnded || !stream.writable) return resolve();
		const timer = setTimeout(resolve, TRANSPORT_FLUSH_TIMEOUT_MS);
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

	const logger = pino(
		{
			level: resolved.level,
			base: {
				deployment: resolveDeployment(),
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

	// Ending the transport is the only reliable flush: the Axiom target only
	// drains its buffer in its close hook, not on pino's in-process flush.
	let flushed: Promise<void> | undefined;
	const flushTransports = () => {
		flushed ??= Promise.all(transportStreams.map(closeTransportStream)).then(
			() => undefined,
		);
		return flushed;
	};

	return { flushTransports, logger };
};
