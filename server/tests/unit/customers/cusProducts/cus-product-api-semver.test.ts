import { describe, expect, test } from "bun:test";
import { ApiVersion, FullCusProductSchema } from "@autumn/shared";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";

const parseApiSemver = (apiSemver: string | null) =>
	FullCusProductSchema.parse({
		...customerProducts.create({}),
		api_semver: apiSemver,
	}).api_semver;

describe("customer product api_semver", () => {
	test("normalises a legacy two-part value stored in prod", () => {
		expect(parseApiSemver("1.2")).toBe(ApiVersion.V1_2);
	});

	test("keeps a valid stored version", () => {
		expect(parseApiSemver(ApiVersion.V2_4)).toBe(ApiVersion.V2_4);
		expect(parseApiSemver(ApiVersion.V1_Beta)).toBe(ApiVersion.V1_Beta);
	});

	test("falls back to null for an unknown version", () => {
		expect(parseApiSemver("9.9.9")).toBeNull();
		expect(parseApiSemver("not-a-version")).toBeNull();
	});

	test("keeps null", () => {
		expect(parseApiSemver(null)).toBeNull();
	});
});
