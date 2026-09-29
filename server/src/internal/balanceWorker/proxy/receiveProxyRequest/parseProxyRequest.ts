import {
	parseApplyBillingPlanRequest,
	parseCheckCommand,
	parseConfirmExpiredLockCommand,
	parseDeleteBalanceCommand,
	parseEvictCommand,
	parseFinalizeCommand,
	parseFlushCommand,
	parseInitializeRequest,
	parseReadSubjectStateCommand,
	parseRecalculateBalanceCommand,
	parseResetCommand,
	parseTrackCommand,
	parseUpdateBalanceCommand,
} from "@autumn/balance-engine";
import type {
	BalanceWorkerProxyCall,
	BalanceWorkerProxyRequest,
} from "@autumn/balance-worker-client";
import type { CommandRecord } from "@autumn/kafka";

const CALLER_PATTERN = /^[\w:.-]{1,64}$/;
/** How far `sentAt` may sit from the API's clock; past it, a captured request is refused. */
const MAX_CLOCK_SKEW_MS = 60_000;

function readRecord({ input }: { input: unknown }): Record<string, unknown> {
	if (typeof input !== "object" || input === null || Array.isArray(input))
		throw new Error("Balance worker proxy expected an object");
	return Object.fromEntries(Object.entries(input));
}

function readNonEmptyString({ input }: { input: unknown }): string {
	if (typeof input !== "string" || input.length === 0)
		throw new Error("Balance worker proxy expected a non-empty string");
	return input;
}

/** Only the commands the client's queue sends. */
function parseQueuedCommand({ input }: { input: unknown }): CommandRecord {
	switch (readRecord({ input }).type) {
		case "track":
			return parseTrackCommand({ input });
		case "reset":
			return parseResetCommand({ input });
		case "updateBalance":
			return parseUpdateBalanceCommand({ input });
		case "evict":
			return parseEvictCommand({ input });
		case "finalize":
			return parseFinalizeCommand({ input });
		default:
			throw new Error("Command cannot be queued through the proxy");
	}
}

function parseQueuedCommands({ input }: { input: unknown }): CommandRecord[] {
	if (!Array.isArray(input))
		throw new Error("Balance worker proxy expected a list of commands");
	return input.map((command) => parseQueuedCommand({ input: command }));
}

function parseProxyCall({
	method,
	params,
}: {
	method: unknown;
	params: Record<string, unknown>;
}): BalanceWorkerProxyCall {
	const { command, request } = params;
	switch (method) {
		case "track":
			return {
				method,
				params: { command: parseTrackCommand({ input: command }) },
			};
		case "check":
			return {
				method,
				params: { command: parseCheckCommand({ input: command }) },
			};
		case "readSubjectState":
			return {
				method,
				params: { command: parseReadSubjectStateCommand({ input: command }) },
			};
		case "initialize":
			return {
				method,
				params: { request: parseInitializeRequest({ input: request }) },
			};
		case "applyBillingPlan":
			return {
				method,
				params: { request: parseApplyBillingPlanRequest({ input: request }) },
			};
		case "evict":
			return {
				method,
				params: { command: parseEvictCommand({ input: command }) },
			};
		case "flush":
			return {
				method,
				params: { command: parseFlushCommand({ input: command }) },
			};
		case "finalize":
			return {
				method,
				params: { command: parseFinalizeCommand({ input: command }) },
			};
		case "confirmExpiredLock":
			return {
				method,
				params: { command: parseConfirmExpiredLockCommand({ input: command }) },
			};
		case "reset":
			return {
				method,
				params: { command: parseResetCommand({ input: command }) },
			};
		case "updateBalance":
			return {
				method,
				params: { command: parseUpdateBalanceCommand({ input: command }) },
			};
		case "deleteBalance":
			return {
				method,
				params: { command: parseDeleteBalanceCommand({ input: command }) },
			};
		case "recalculateBalance":
			return {
				method,
				params: { command: parseRecalculateBalanceCommand({ input: command }) },
			};
		case "enqueue":
			return {
				method,
				params: { commands: parseQueuedCommands({ input: params.commands }) },
			};
		case "invalidateOrgCatalog":
			return {
				method,
				params: {
					orgId: readNonEmptyString({ input: params.orgId }),
					env: readNonEmptyString({ input: params.env }),
				},
			};
		default:
			throw new Error("Unknown balance worker proxy method");
	}
}

/** Only a body whose signature was already checked; refuses one sent outside the clock window. */
export function parseProxyRequest({
	rawBody,
}: {
	rawBody: string;
}): BalanceWorkerProxyRequest {
	const { method, params, caller, sentAt } = readRecord({
		input: JSON.parse(rawBody),
	});
	const callerIsNamed =
		typeof caller === "string" && CALLER_PATTERN.test(caller);
	const sentInsideClockWindow =
		typeof sentAt === "number" &&
		Math.abs(Date.now() - sentAt) <= MAX_CLOCK_SKEW_MS;
	if (!callerIsNamed) throw new Error("Balance worker proxy caller is invalid");
	if (!sentInsideClockWindow)
		throw new Error("Balance worker proxy request has expired");
	return {
		...parseProxyCall({ method, params: readRecord({ input: params }) }),
		caller,
		sentAt,
	};
}
