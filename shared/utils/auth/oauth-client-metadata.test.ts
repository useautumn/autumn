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
});
