import { Hono } from "hono";
import type { Context } from "hono";
import type { HonoEnv } from "../honoUtils/HonoEnv.js";

const hopByHopHeaders = [
	"connection",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
];

const getMcpUpstream = () => {
	const upstream = process.env.MCP_UPSTREAM_URL;
	if (!upstream) return null;

	try {
		return new URL(upstream);
	} catch {
		return null;
	}
};

const proxyMcp = async (c: Context<HonoEnv>) => {
	const upstream = getMcpUpstream();
	if (!upstream) {
		return c.json({ error: "MCP upstream not configured" }, 503);
	}

	const incomingUrl = new URL(c.req.url);
	const targetUrl = new URL(incomingUrl.pathname + incomingUrl.search, upstream);
	const headers = new Headers(c.req.raw.headers);
	const forwardedHost =
		headers.get("x-forwarded-host") ?? headers.get("host") ?? incomingUrl.host;
	const forwardedProto =
		headers.get("x-forwarded-proto") ?? incomingUrl.protocol.replace(":", "");

	for (const header of hopByHopHeaders) headers.delete(header);

	headers.delete("host");
	headers.set("x-autumn-forwarded-host", forwardedHost);
	headers.set("x-autumn-forwarded-proto", forwardedProto);
	headers.set("x-forwarded-host", forwardedHost);
	headers.set("x-forwarded-proto", forwardedProto);

	const hasBody = c.req.method !== "GET" && c.req.method !== "HEAD";
	const response = await fetch(targetUrl, {
		method: c.req.method,
		headers,
		body: hasBody ? c.req.raw.body : undefined,
		duplex: hasBody ? "half" : undefined,
	} as RequestInit & { duplex?: "half" });

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: response.headers,
	});
};

export const mcpProxyRouter = new Hono<HonoEnv>();

mcpProxyRouter.all("/mcp", proxyMcp);
mcpProxyRouter.all("/mcp/*", proxyMcp);
mcpProxyRouter.all("/internal/mcp", proxyMcp);
mcpProxyRouter.all("/internal/mcp/*", proxyMcp);
mcpProxyRouter.all("/.well-known/oauth-protected-resource/mcp", proxyMcp);
mcpProxyRouter.all("/.well-known/oauth-protected-resource/internal/mcp", proxyMcp);
