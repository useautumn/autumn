import type { SDKOptions } from "../../../lib/config.js";

/** `atomURL` as the client holds it; the regenerated `SDKOptions` declares it too (.speakeasy/patches). */
export type AtomSDKOptions = SDKOptions & {
	atomURL?: string | undefined;
};
