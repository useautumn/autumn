import type { Context } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";

export const getTrustedClientIp = ({ c }: { c: Context<HonoEnv> }): string => {
	const trustedProxyDepth = Number.parseInt(
		process.env.TRUSTED_PROXY_DEPTH ?? "1",
		10,
	);
	const forwardedFor = c.req
		.header("x-forwarded-for")
		?.split(",")
		.map((address) => address.trim())
		.filter(Boolean);
	const trustedForwardedIp =
		forwardedFor && Number.isInteger(trustedProxyDepth) && trustedProxyDepth > 0
			? forwardedFor[forwardedFor.length - trustedProxyDepth - 1]
			: undefined;

	return (
		c.req.header("cf-connecting-ip") ??
		c.req.header("x-real-ip") ??
		trustedForwardedIp ??
		"unknown"
	);
};
