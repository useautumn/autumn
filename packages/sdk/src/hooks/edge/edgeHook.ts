import type { SDKOptions } from "../../lib/config.js";
import type { RequestInput } from "../../lib/http.js";
import type {
	BeforeCreateRequestContext,
	BeforeCreateRequestHook,
	SDKInitHook,
} from "../types.js";
import { edgeHTTPClientOf } from "./edgeHTTPClient.js";
import { edgeBasesOf, rebaseURL } from "./edgeURLs.js";
import type { EdgeSDKOptions } from "./types/edgeSDKOptions.js";

/** What the edge serves, by operationID. Track never goes there; finalize joins once the Atom dedupes it by key. */
const EDGE_OPERATION_IDS = new Set(["check"]);

/**
 * With `useEdge` and an `edgeURL`, sends each call the edge serves to the edge first (`autumn.edge` is the same client
 * with `useEdge` on). The client's HTTP client falls back to the Autumn API when the edge is down.
 */
export class EdgeHook implements SDKInitHook, BeforeCreateRequestHook {
	sdkInit(opts: SDKOptions): SDKOptions {
		const bases = edgeBasesOf({ options: opts });
		if (!bases || !opts.httpClient) return opts;
		opts.httpClient = edgeHTTPClientOf({ client: opts.httpClient, bases });
		return opts;
	}

	beforeCreateRequest(
		hookCtx: BeforeCreateRequestContext,
		input: RequestInput,
	): RequestInput {
		const options: EdgeSDKOptions = hookCtx.options;
		const bases = edgeBasesOf({ options });
		if (!options.useEdge || !bases) return input;
		if (!EDGE_OPERATION_IDS.has(hookCtx.operationID)) return input;
		// Only a call bound for the client's Autumn API: a per-call `serverURL` is the caller's choice.
		const edgeURL = rebaseURL({
			url: input.url,
			from: bases.autumn,
			to: bases.edge,
		});
		return edgeURL ? { ...input, url: edgeURL } : input;
	}
}
