import { serverURLFromOptions } from "../../lib/config.js";
import type { EdgeSDKOptions } from "./types/edgeSDKOptions.js";

const withTrailingSlash = (url: string | URL): string =>
	String(url).replace(/\/+$/, "") + "/";

/** The client's Autumn API and edge bases, or null when it has no edge. */
export const edgeBasesOf = ({
	options,
}: {
	options: EdgeSDKOptions;
}): { autumn: string; edge: string } | null => {
	if (!options.edgeURL) return null;
	const autumn = serverURLFromOptions(options);
	if (!autumn) return null;
	return {
		autumn: withTrailingSlash(autumn),
		edge: withTrailingSlash(options.edgeURL),
	};
};

/** `url` under base `from`, moved to the same path under base `to`; null when it isn't under `from`. */
export const rebaseURL = ({
	url,
	from,
	to,
}: {
	url: string | URL;
	from: string;
	to: string;
}): URL | null => {
	const href = String(url);
	if (!withTrailingSlash(href).startsWith(from)) return null;
	return new URL(href.slice(from.length), to);
};
