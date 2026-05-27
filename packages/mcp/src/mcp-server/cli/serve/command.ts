import { buildCommand } from "@stricli/core";
import * as z from "zod/v4";
import { consoleLoggerLevels } from "../../console-logger.js";

const envParser = (value: string) => {
	const sepIdx = value.indexOf("=");
	if (sepIdx === -1) throw new Error("Invalid environment variable format");
	return [
		z.string().min(1).parse(value.slice(0, sepIdx)),
		z.string().min(1).parse(value.slice(sepIdx + 1)),
	] satisfies [string, string];
};

export const serveCommand = buildCommand({
	loader: async () => {
		const { main } = await import("./impl.js");
		return main;
	},
	parameters: {
		flags: {
			port: {
				kind: "parsed",
				brief: "Port for Streamable HTTP",
				default: "2718",
				parse: (value) => z.coerce.number().int().gte(0).lt(65536).parse(value),
			},
			"disable-static-auth": {
				kind: "boolean",
				brief: "Require auth from request headers instead of CLI flags",
				default: false,
			},
			"oauth-enabled": {
				kind: "boolean",
				brief: "Require OAuth bearer auth for Streamable HTTP",
				default: false,
			},
			"oauth-issuer-url": {
				kind: "parsed",
				brief: "Autumn OAuth issuer URL",
				optional: true,
				parse: (value) => new URL(value).toString().replace(/\/$/, ""),
			},
			"oauth-resource-url": {
				kind: "parsed",
				brief: "Canonical MCP resource URL",
				optional: true,
				parse: (value) => new URL(value).toString().replace(/\/$/, ""),
			},
			"oauth-api-key-url": {
				kind: "parsed",
				brief: "Autumn OAuth API key exchange URL",
				optional: true,
				parse: (value) => new URL(value).toString(),
			},
			"oauth-environment": {
				kind: "enum",
				brief: "Autumn environment for OAuth-backed tool calls",
				default: "sandbox",
				values: ["sandbox", "live"],
			},
			"secret-key": {
				kind: "parsed",
				brief: "Autumn API key for local/static auth",
				optional: true,
				parse: (value) => z.string().parse(value),
			},
			"x-api-version": {
				kind: "parsed",
				brief: "Autumn API version",
				optional: true,
				parse: (value) => z.string().default("2.3.0").parse(value),
			},
			"fail-open": {
				kind: "parsed",
				brief: "Autumn fail-open header",
				optional: true,
				parse: (value) =>
					z.enum(["true", "false"]).transform((v) => v === "true").parse(value),
			},
			"server-url": {
				kind: "parsed",
				brief: "Autumn API base URL",
				optional: true,
				parse: (value) => new URL(value).toString(),
			},
			"log-level": {
				kind: "enum",
				brief: "Log level",
				default: "info",
				values: consoleLoggerLevels,
			},
			env: {
				kind: "parsed",
				brief: "Environment variables made available to the server",
				optional: true,
				variadic: true,
				parse: envParser,
			},
		},
	},
	docs: {
		brief: "Run the MCP server with Streamable HTTP transport",
	},
});
