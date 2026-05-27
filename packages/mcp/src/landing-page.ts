import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { toolNames } from "./tool-names.js";

export function landingPageExpress(req: ExpressRequest, res: ExpressResponse) {
	const proto = req.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? req.protocol;
	const host = req.get("host");
	if (!host) {
		res.status(400).send("Missing Host header");
		return;
	}
	res.type("html").send(landingPageHTML(`${proto}://${host}`));
}

export function landingPageHTML(origin: string): string {
	const url = `${origin}/mcp`;
	const config = {
		mcpServers: {
			autumn: {
				type: "streamable-http",
				url,
			},
		},
	};

	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>Autumn MCP</title>
	<style>
		body { margin: 0; font: 15px/1.5 system-ui, sans-serif; color: #171717; background: #fafafa; }
		main { max-width: 760px; margin: 72px auto; padding: 0 24px; }
		h1 { margin: 0 0 8px; font-size: 32px; line-height: 1.2; }
		p { color: #525252; }
		code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
		pre { overflow: auto; padding: 16px; border: 1px solid #e5e5e5; border-radius: 8px; background: white; }
		li { margin: 8px 0; }
	</style>
</head>
<body>
	<main>
		<h1>Autumn MCP</h1>
		<p>Use this Streamable HTTP endpoint with OAuth-capable MCP clients.</p>
		<pre>${escapeHtml(JSON.stringify(config, null, 2))}</pre>
		<h2>Tools</h2>
		<ul>${toolNames
			.map((tool) => `<li><code>${escapeHtml(tool.name)}</code>: ${escapeHtml(tool.description)}</li>`)
			.join("")}</ul>
	</main>
</body>
</html>`;
}

const escapeHtml = (value: string) =>
	value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
