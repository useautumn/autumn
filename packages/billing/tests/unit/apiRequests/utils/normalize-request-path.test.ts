import { describe, expect, test } from "bun:test";
import { normalizeRequestPath } from "../../../../src/apiRequests/utils/normalizeRequestPath";

describe("normalizeRequestPath", () => {
	test.each([
		["https://api.useautumn.com/v1/customers/cus_1", "/customers/cus_1"],
		["http://localhost:8080/v1/track?x=1#frag", "/track"],
		["/v1/check", "/check"],
		["/check", "/check"],
		["v1/check", "/check"],
		["/v2/balances.track", "/balances.track"],
		["/v1/customers/cus_1/", "/customers/cus_1"],
		["/v1//customers//cus_1", "/customers/cus_1"],
		["/v1", "/"],
		["  /v1/entitled  ", "/entitled"],
	])("%s → %s", (url, path) => {
		expect(normalizeRequestPath(url)).toBe(path);
	});
});
