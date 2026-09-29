/** Dependency free so the parser can be exercised without loading any server
 *  module. The caps mirror runReplayOperator, which re-validates them. */
const MAX_SELECTED_REQUESTS = 1000;
const MAX_REQUESTS_PER_SECOND = 10;
const HELP_FLAG = "--help";

export class ReplayOperatorArgumentError extends Error {
	constructor({ message }: { message: string }) {
		super(message);
		this.name = "ReplayOperatorArgumentError";
	}
}

export type ReplayOperatorCommand =
	| { help: true }
	| {
			help: false;
			manifestPath: string;
			policyPath: string;
			execute: boolean;
			confirmFrozenBaseline: boolean;
			maxRequests: number;
			requestsPerSecond: number;
	  };

type ArgumentDraft = {
	manifestPath?: string;
	policyPath?: string;
	execute: boolean;
	confirmFrozenBaseline: boolean;
	maxRequests: number;
	requestsPerSecond: number;
};

function argumentError({
	message,
}: {
	message: string;
}): ReplayOperatorArgumentError {
	return new ReplayOperatorArgumentError({
		message: `invalid replay operator arguments: ${message}`,
	});
}

function readFlagValue({
	args,
	index,
	flag,
}: {
	args: readonly string[];
	index: number;
	flag: string;
}): string {
	const value = args[index + 1];
	if (value === undefined || value.startsWith("--")) {
		throw argumentError({ message: `${flag} requires a value` });
	}
	return value;
}

function readTextValue({
	args,
	index,
	flag,
}: {
	args: readonly string[];
	index: number;
	flag: string;
}): string {
	const value = readFlagValue({ args, index, flag });
	if (value.trim().length === 0) {
		throw argumentError({ message: `${flag} requires a non-empty path` });
	}
	return value;
}

function readBoundedNumberValue({
	args,
	index,
	flag,
	maximum,
}: {
	args: readonly string[];
	index: number;
	flag: string;
	maximum: number;
}): number {
	const value = Number(readFlagValue({ args, index, flag }));
	if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
		throw argumentError({
			message: `${flag} must be a whole number between 1 and ${maximum}`,
		});
	}
	return value;
}

/** Rejected arguments may carry credentials (a connection string, a
 *  --password=... flag), so the raw text is never placed in the message. */
function describeUnsupportedArgument({ flag }: { flag: string }): string {
	return flag.startsWith("--")
		? "unknown flag"
		: "unexpected positional argument";
}

function applyArgument({
	args,
	index,
	draft,
}: {
	args: readonly string[];
	index: number;
	draft: ArgumentDraft;
}): number {
	const flag = args[index] ?? "";
	switch (flag) {
		case "--execute":
			draft.execute = true;
			return index + 1;
		case "--confirm-frozen-baseline":
			draft.confirmFrozenBaseline = true;
			return index + 1;
		case "--manifest":
			draft.manifestPath = readTextValue({ args, index, flag });
			return index + 2;
		case "--target-policy":
			draft.policyPath = readTextValue({ args, index, flag });
			return index + 2;
		case "--max-requests":
			draft.maxRequests = readBoundedNumberValue({
				args,
				index,
				flag,
				maximum: MAX_SELECTED_REQUESTS,
			});
			return index + 2;
		case "--requests-per-second":
			draft.requestsPerSecond = readBoundedNumberValue({
				args,
				index,
				flag,
				maximum: MAX_REQUESTS_PER_SECOND,
			});
			return index + 2;
		default:
			throw argumentError({ message: describeUnsupportedArgument({ flag }) });
	}
}

function buildCommand({
	draft,
}: {
	draft: ArgumentDraft;
}): ReplayOperatorCommand {
	if (draft.manifestPath === undefined) {
		throw argumentError({ message: "--manifest is required" });
	}
	if (draft.policyPath === undefined) {
		throw argumentError({ message: "--target-policy is required" });
	}
	if (draft.execute && !draft.confirmFrozenBaseline) {
		throw argumentError({
			message: "--execute also requires --confirm-frozen-baseline",
		});
	}
	return {
		help: false,
		manifestPath: draft.manifestPath,
		policyPath: draft.policyPath,
		execute: draft.execute,
		confirmFrozenBaseline: draft.confirmFrozenBaseline,
		maxRequests: draft.maxRequests,
		requestsPerSecond: draft.requestsPerSecond,
	};
}

export function parseReplayOperatorArgs({
	args,
}: {
	args: readonly string[];
}): ReplayOperatorCommand {
	if (args.includes(HELP_FLAG)) return { help: true };
	const draft: ArgumentDraft = {
		execute: false,
		confirmFrozenBaseline: false,
		maxRequests: MAX_SELECTED_REQUESTS,
		requestsPerSecond: MAX_REQUESTS_PER_SECOND,
	};
	let index = 0;
	while (index < args.length) {
		index = applyArgument({ args, index, draft });
	}
	return buildCommand({ draft });
}
