import { parseInbound } from "@autumn/balance-engine";
import type { Context } from "hono";
import type { BalanceWorkerHttpEnv } from "../types/balanceWorkerHttp.js";

type Parse<Parsed> = (params: { input: unknown }) => Parsed;

/** The request's command as a newer server may send it: unknown keys are dropped and logged, never a 400. */
export function readInboundCommand<Command>({
	context,
	parse,
}: {
	context: Context<BalanceWorkerHttpEnv>;
	parse: Parse<Command>;
}): Command {
	return readInbound({ context, parse, input: context.get("request").command });
}

/** A command whose rows ride in the payload beside it, read as one request the same way. */
export function readInboundRequest<Request>({
	context,
	parse,
}: {
	context: Context<BalanceWorkerHttpEnv>;
	parse: Parse<Request>;
}): Request {
	const { command, payload } = context.get("request");
	return readInbound({
		context,
		parse,
		input: { ...(payload as object | undefined), command },
	});
}

function readInbound<Parsed>({
	context,
	parse,
	input,
}: {
	context: Context<BalanceWorkerHttpEnv>;
	parse: Parse<Parsed>;
	input: unknown;
}): Parsed {
	const requestLog = context.get("requestLog");
	return parseInbound({
		parse,
		input,
		onUnknownKeys: ({ keyPaths }) => {
			requestLog.unknownKeys = keyPaths;
		},
	});
}
