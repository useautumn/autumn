import type { AutumnCore } from "../../core.js";
import type { RequestOptions } from "../../lib/sdks.js";
import type { Result } from "../../types/fp.js";
import { atomURLOf, isAtomDown } from "./atomDown.js";
import type { AutumnCall } from "./types/autumnCall.js";

/**
 * Makes `call` on the same client, sent to the Atom at `atomURL`, and asks the Autumn API only when Atom is down.
 * Without an `atomURL`, or for a write, the Autumn API is asked straight away.
 */
export const askAtom = async <Request, Response, Failure>({
	client,
	call,
	request,
	options,
	writes = false,
}: {
	client: AutumnCore;
	call: AutumnCall<Request, Response, Failure>;
	request: Request;
	options: RequestOptions | undefined;
	writes?: boolean;
}): Promise<Result<Response, Failure>> => {
	const atomURL = atomURLOf({ options: client._options });
	// Atom hands every write to the API itself; sending one there only adds a hop where it could land twice.
	if (!atomURL || writes) return call(client, request, options);

	const answer = await call(client, request, {
		...options,
		serverURL: atomURL,
	});
	if (answer.ok || !isAtomDown({ error: answer.error })) return answer;
	return call(client, request, options);
};
