import { afterAll, beforeAll, expect, test } from "bun:test";
import axios from "axios";
import { TW_TEST_FILE_HEADER } from "@/external/connect/clientCache/twStripeLimiter/twStripeRequestContext.js";
import { tagTwTestFileRequests } from "../../utils/tw/tagTwTestFileRequests";

const originalFetch = globalThis.fetch;
const originalAxiosHeader = axios.defaults.headers.common[TW_TEST_FILE_HEADER];
const serve = () =>
	Bun.serve({
		port: 0,
		fetch: (request) =>
			Response.json({
				tag: request.headers.get(TW_TEST_FILE_HEADER),
				custom: request.headers.get("x-custom"),
			}),
	});
const server = serve();
const other = serve();

beforeAll(async () => {
	await tagTwTestFileRequests({
		fileTag: "file-tag-1",
		serverUrls: [`http://localhost:${server.port}`, undefined, "not a url"],
	});
});

afterAll(() => {
	globalThis.fetch = originalFetch;
	if (originalAxiosHeader === undefined)
		delete axios.defaults.headers.common[TW_TEST_FILE_HEADER];
	else axios.defaults.headers.common[TW_TEST_FILE_HEADER] = originalAxiosHeader;
	server.stop(true);
	other.stop(true);
});

test("fetches to the worker's server carry the file tag and keep their own headers", async () => {
	const response = await fetch(`http://localhost:${server.port}/v1/x`, {
		headers: { "x-custom": "kept" },
	});
	expect(await response.json()).toEqual({ tag: "file-tag-1", custom: "kept" });
});

test("Request objects keep their headers too", async () => {
	const response = await fetch(
		new Request(`http://localhost:${server.port}/v1/x`, {
			headers: { "x-custom": "from-request" },
		}),
	);
	expect(await response.json()).toEqual({
		tag: "file-tag-1",
		custom: "from-request",
	});
});

test("other origins are left untagged", async () => {
	const response = await fetch(`http://localhost:${other.port}/`);
	expect(await response.json()).toEqual({ tag: null, custom: null });
});

test("axios instances created afterwards send the tag", async () => {
	const client = axios.create({ baseURL: `http://localhost:${server.port}` });
	const { data } = await client.get("/v1/x");
	expect(data.tag).toBe("file-tag-1");
});
