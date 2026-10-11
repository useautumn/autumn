import { AutumnError } from "../../models/autumn-error.js";
import {
	ConnectionError,
	RequestTimeoutError,
	UnexpectedClientError,
} from "../../models/http-client-errors.js";
import type { HookContext } from "../types.js";
import type { AtomSDKOptions } from "./types/atomSDKOptions.js";

/** Atom sets it on every reply the Autumn API gave, its errors included: that call may already have landed. */
const ATOM_FORWARDED_HEADER = "x-atom-forwarded";

export const atomURLOf = ({ options }: { options: AtomSDKOptions }) =>
	options.atomURL;

/** A 5xx Atom answered itself, or the SDK's 555 for no answer at all: the Autumn API never saw the call. */
const isAtomDownStatus = ({
	status,
	headers,
}: {
	status: number;
	headers: Headers;
}): boolean => {
	const serverFailed = status >= 500;
	const apiAnswered = headers.has(ATOM_FORWARDED_HEADER);
	return serverFailed && !apiAnswered;
};

/** No reply at all; Bun reports a refused connection as an unexpected client error, Node as a connection error. */
const isNoReply = (error: unknown): boolean =>
	error instanceof ConnectionError ||
	error instanceof RequestTimeoutError ||
	error instanceof UnexpectedClientError;

/** Whether a failed Atom call is asked of the Autumn API instead. A real answer, a 4xx or a forwarded one, never is. */
export const isAtomDown = ({ error }: { error: unknown }): boolean => {
	if (isNoReply(error)) return true;
	return (
		error instanceof AutumnError &&
		isAtomDownStatus({ status: error.statusCode, headers: error.headers })
	);
};

/** An Atom outage is not one to fail open on: `autumn.atom` asks the Autumn API instead. */
export const isAtomDownReply = ({
	hookCtx,
	response,
}: {
	hookCtx: HookContext;
	response: Response;
}): boolean => {
	const atomURL = atomURLOf({ options: hookCtx.options });
	const sentToAtom =
		atomURL !== undefined && String(hookCtx.baseURL) === atomURL;
	return sentToAtom && isAtomDownStatus(response);
};
