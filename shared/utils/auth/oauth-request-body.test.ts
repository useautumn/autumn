import { describe, expect, test } from "bun:test";
import {
	parseOAuthRequestFields,
	rebuildOAuthRequest,
} from "./oauthRequestBody";

const postRequest = ({
	body,
	contentType,
}: {
	body: string;
	contentType?: string;
}) =>
	new Request("https://api.useautumn.com/api/auth/oauth2/token", {
		method: "POST",
		headers: contentType ? { "content-type": contentType } : undefined,
		body,
	});

describe("parseOAuthRequestFields", () => {
	test("parses json bodies", async () => {
		const parsed = await parseOAuthRequestFields(
			postRequest({
				body: '{"grant_type":"refresh_token","resource":"https://x/mcp"}',
				contentType: "application/json; charset=utf-8",
			}),
		);

		expect(parsed.isJson).toBe(true);
		expect(parsed.fields).toEqual({
			grant_type: "refresh_token",
			resource: "https://x/mcp",
		});
	});

	test("parses form bodies", async () => {
		const parsed = await parseOAuthRequestFields(
			postRequest({
				body: "grant_type=refresh_token&resource=https%3A%2F%2Fx%2Fmcp",
				contentType: "application/x-www-form-urlencoded",
			}),
		);

		expect(parsed.isJson).toBe(false);
		expect(parsed.fields).toEqual({
			grant_type: "refresh_token",
			resource: "https://x/mcp",
		});
	});

	test("sniffs json bodies sent without a content type", async () => {
		const parsed = await parseOAuthRequestFields(
			postRequest({ body: '{"client_name":"Cursor"}' }),
		);

		expect(parsed.isJson).toBe(true);
		expect(parsed.fields).toEqual({ client_name: "Cursor" });
	});

	test("returns empty fields for malformed json and empty bodies", async () => {
		const malformed = await parseOAuthRequestFields(
			postRequest({ body: "{oops", contentType: "application/json" }),
		);
		expect(malformed.fields).toEqual({});
		expect(malformed.rawBody).toBe("{oops");

		const empty = await parseOAuthRequestFields(
			postRequest({ body: "", contentType: "application/json" }),
		);
		expect(empty.fields).toEqual({});
		expect(empty.rawBody).toBe("");
	});
});

// The refresh replay key hashes the rebuilt body, so the encoding has to be
// canonical: same fields in, same bytes out, whatever order they arrived in.
describe("rebuildOAuthRequest", () => {
	test("re-encodes json fields in key order, keeping nested values", async () => {
		const request = postRequest({
			body: '{"b":"2","a":"1"}',
			contentType: "application/json",
		});
		const rebuilt = rebuildOAuthRequest({
			fields: { b: "2", a: "1", nested: { keep: true } },
			isJson: true,
			request,
		});

		expect(await rebuilt.text()).toBe(
			'{"a":"1","b":"2","nested":{"keep":true}}',
		);
	});

	test("re-encodes form fields in key order, dropping non-string values", async () => {
		const request = postRequest({
			body: "b=2&a=1",
			contentType: "application/x-www-form-urlencoded",
		});
		const rebuilt = rebuildOAuthRequest({
			fields: { b: "2", a: "1", nested: { drop: true } },
			isJson: false,
			request,
		});

		expect(await rebuilt.text()).toBe("a=1&b=2");
	});
});
