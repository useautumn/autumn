import { describe, expect, test } from "bun:test";
import {
	getOAuthStringField,
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
		expect(parsed.searchParams).toBeNull();
		expect(parsed.fields).toEqual({
			grant_type: "refresh_token",
			resource: "https://x/mcp",
		});
	});

	test("parses form bodies and keeps the raw search params", async () => {
		const parsed = await parseOAuthRequestFields(
			postRequest({
				body: "grant_type=refresh_token&resource=a&resource=b",
				contentType: "application/x-www-form-urlencoded",
			}),
		);

		expect(parsed.isJson).toBe(false);
		expect(parsed.searchParams?.getAll("resource")).toEqual(["a", "b"]);
		expect(parsed.fields.grant_type).toBe("refresh_token");
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

describe("rebuildOAuthRequest", () => {
	test("re-encodes json fields and can sort keys", async () => {
		const request = postRequest({
			body: '{"b":"2","a":"1"}',
			contentType: "application/json",
		});
		const rebuilt = rebuildOAuthRequest({
			fields: { b: "2", a: "1" },
			isJson: true,
			request,
			sortKeys: true,
		});

		expect(await rebuilt.text()).toBe('{"a":"1","b":"2"}');
	});

	test("re-encodes form fields, dropping non-string values", async () => {
		const request = postRequest({
			body: "b=2&a=1",
			contentType: "application/x-www-form-urlencoded",
		});
		const rebuilt = rebuildOAuthRequest({
			fields: { b: "2", a: "1", nested: { drop: true } },
			isJson: false,
			request,
			sortKeys: true,
		});

		expect(await rebuilt.text()).toBe("a=1&b=2");
	});
});

describe("getOAuthStringField", () => {
	test("returns non-empty strings only", () => {
		expect(getOAuthStringField("value")).toBe("value");
		expect(getOAuthStringField("")).toBeNull();
		expect(getOAuthStringField(1)).toBeNull();
		expect(getOAuthStringField(["value"])).toBeNull();
	});
});
