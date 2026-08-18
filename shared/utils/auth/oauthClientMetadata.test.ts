import { describe, expect, test } from "bun:test";
import {
	MCP_CLIENT_KIND,
	parseOAuthClientMetadata,
} from "./oauthClientMetadata";

describe("parseOAuthClientMetadata", () => {
	test("returns an empty object for nullish metadata", () => {
		expect(parseOAuthClientMetadata(null)).toEqual({});
		expect(parseOAuthClientMetadata(undefined)).toEqual({});
		expect(parseOAuthClientMetadata("")).toEqual({});
	});

	test("passes through object metadata", () => {
		expect(parseOAuthClientMetadata({ kind: MCP_CLIENT_KIND })).toEqual({
			kind: MCP_CLIENT_KIND,
		});
	});

	test("parses legacy string-encoded metadata", () => {
		expect(
			parseOAuthClientMetadata('{"kind":"mcp_client","mcpClientType":"slack"}'),
		).toEqual({ kind: MCP_CLIENT_KIND, mcpClientType: "slack" });
	});

	test("returns an empty object for malformed or non-object json", () => {
		expect(parseOAuthClientMetadata("{not json")).toEqual({});
		expect(parseOAuthClientMetadata("42")).toEqual({});
		expect(parseOAuthClientMetadata(7)).toEqual({});
	});

	test("reads the legacy first-party classification keys", () => {
		expect(
			parseOAuthClientMetadata({
				client: "atmn",
				clientType: "atmn",
				client_type: "atmn",
				source: "autumn-cli",
			}),
		).toEqual({
			client: "atmn",
			clientType: "atmn",
			client_type: "atmn",
			source: "autumn-cli",
		});
	});

	test("drops only the malformed key, not its siblings", () => {
		expect(parseOAuthClientMetadata({ kind: 7, client: "summer" })).toEqual({
			client: "summer",
		});
	});

	test("ignores keys it does not classify on", () => {
		expect(
			parseOAuthClientMetadata({ kind: MCP_CLIENT_KIND, unrelated: "value" }),
		).toEqual({ kind: MCP_CLIENT_KIND });
	});
});
