import { describe, expect, test } from "bun:test";
import {
	DEV_PATH_PREFIXES,
	isCrossAppDevPath,
	isDwHeadless,
	usesPathProxy,
} from "./paths.js";

describe("DEV_PATH_PREFIXES", () => {
	test("are the public folders on the shared hostname", () => {
		expect(DEV_PATH_PREFIXES).toEqual({
			backend: "/backend",
			checkout: "/checkout",
			dashboard: "/dashboard",
			leaf: "/leaf",
		});
	});

	test("isCrossAppDevPath skips other services, not the current app", () => {
		expect(isCrossAppDevPath("/backend/v1")).toBe(true);
		expect(isCrossAppDevPath("/checkout")).toBe(true);
		expect(isCrossAppDevPath("/leaf/mcp")).toBe(true);
		expect(isCrossAppDevPath("/dashboard/sign-in")).toBe(false);
		expect(isCrossAppDevPath("/sign-in")).toBe(false);
	});
});

describe("dev flags", () => {
	test("DW_HEADLESS implies path proxy", () => {
		expect(isDwHeadless({ DW_HEADLESS: "true" })).toBe(true);
		expect(usesPathProxy({ DW_HEADLESS: "1" })).toBe(true);
		expect(usesPathProxy({ DW_PATH_PROXY: "1" })).toBe(true);
		expect(usesPathProxy({})).toBe(false);
	});
});
