import { describe, expect, test } from "bun:test";
import { parseBillingFeaturesHeader } from "@/honoMiddlewares/utils/parseBillingFeaturesHeader.js";

describe("parseBillingFeaturesHeader", () => {
	test("reads feature=bool pairs", () => {
		expect(parseBillingFeaturesHeader("atoms=true, foo=false")).toEqual({
			atoms: true,
			foo: false,
		});
	});

	test("is undefined without the header", () => {
		expect(parseBillingFeaturesHeader(undefined)).toBeUndefined();
	});
});
