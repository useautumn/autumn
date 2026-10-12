import type { SDKOptions } from "../../../lib/config.js";

/** The edge options as the client holds them; the regenerated `SDKOptions` declares them too (.speakeasy/patches). */
export type EdgeSDKOptions = SDKOptions & {
	edgeURL?: string | undefined;
	useEdge?: boolean | undefined;
};
