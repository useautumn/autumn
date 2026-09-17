import { version } from "../version";

const runtime =
	typeof Bun !== "undefined"
		? `bun ${Bun.version}`
		: `node ${process.versions.node}`;

/** What the server logs as `user_agent` for every request this CLI makes. */
export const USER_AGENT = `atmn/${version} (${process.platform}; ${runtime})`;

/** A fetch that stamps the CLI's user agent unless the caller already set one. */
export const withUserAgent = (
	base: typeof globalThis.fetch,
): typeof globalThis.fetch => {
	const stamped = (
		input: Parameters<typeof globalThis.fetch>[0],
		init?: Parameters<typeof globalThis.fetch>[1],
	) => {
		const headers = new Headers(init?.headers);
		if (!headers.has("user-agent")) headers.set("user-agent", USER_AGENT);
		return base(input, { ...init, headers });
	};
	// Bun's fetch carries extras like `preconnect`; keep them on the wrapper.
	return Object.assign(stamped, base);
};

/** The one transport every request to Autumn goes through. */
export const autumnFetch: typeof globalThis.fetch = withUserAgent(
	globalThis.fetch,
);
