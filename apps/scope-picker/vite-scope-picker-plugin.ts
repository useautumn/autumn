import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url));

export function scopePickerPlugin(): Plugin {
	const DECISIONS_PATH = resolve(PLUGIN_DIR, "..", "scope-decisions.json");

	const readDecisions = (): Record<string, unknown> => {
		if (!existsSync(DECISIONS_PATH)) return {};
		try {
			return JSON.parse(readFileSync(DECISIONS_PATH, "utf8"));
		} catch (err) {
			console.error("[scope-picker] failed to read decisions file:", err);
			return {};
		}
	};

	const writeDecisions = (data: Record<string, unknown>): void => {
		writeFileSync(DECISIONS_PATH, `${JSON.stringify(data, null, 2)}\n`);
	};

	return {
		name: "scope-picker",
		apply: "serve",
		configureServer(server) {
			server.middlewares.use("/api/scope-picker/decisions", async (req, res) => {
				res.setHeader("Content-Type", "application/json");

				try {
					if (req.method === "GET") {
						const data = readDecisions();
						res.statusCode = 200;
						res.end(JSON.stringify({ decisions: data, path: DECISIONS_PATH }));
						return;
					}

					if (req.method === "POST" || req.method === "PUT") {
						const chunks: Buffer[] = [];
						for await (const chunk of req) chunks.push(Buffer.from(chunk));
						const bodyText = Buffer.concat(chunks).toString("utf8");
						const body = bodyText ? JSON.parse(bodyText) : {};
						const decisions = body?.decisions ?? {};
						if (typeof decisions !== "object") {
							res.statusCode = 400;
							res.end(JSON.stringify({ error: "decisions must be an object" }));
							return;
						}
						writeDecisions(decisions);
						res.statusCode = 200;
						res.end(
							JSON.stringify({
								ok: true,
								count: Object.keys(decisions).length,
								path: DECISIONS_PATH,
							}),
						);
						return;
					}

					res.statusCode = 405;
					res.end(JSON.stringify({ error: `method ${req.method} not allowed` }));
				} catch (err) {
					res.statusCode = 500;
					res.end(
						JSON.stringify({
							error: err instanceof Error ? err.message : String(err),
						}),
					);
				}
			});
		},
	};
}
