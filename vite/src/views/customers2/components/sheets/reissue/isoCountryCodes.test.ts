import { describe, expect, it } from "bun:test";
import { STRIPE_TAX_ID_OPTIONS } from "@autumn/shared";
import { ISO_COUNTRY_CODES } from "./isoCountryCodes";

describe("ISO_COUNTRY_CODES", () => {
	it("is the 249 assigned ISO 3166-1 alpha-2 codes with no duplicates", () => {
		expect(new Set(ISO_COUNTRY_CODES).size).toBe(ISO_COUNTRY_CODES.length);
		expect(ISO_COUNTRY_CODES.length).toBe(249);
	});

	it("excludes user-assigned and non-country regions the browser can still name", () => {
		const codes = new Set<string>(ISO_COUNTRY_CODES);
		for (const code of ["ZZ", "UN", "XA", "XB", "EU", "EZ", "XK", "QO"]) {
			expect(codes.has(code)).toBe(false);
		}
	});

	it("covers every country in the tax id table", () => {
		const codes = new Set<string>(ISO_COUNTRY_CODES);
		// eu_oss_vat is an EU-wide registration, not a country a customer lives in.
		const missing = STRIPE_TAX_ID_OPTIONS.map(
			(option) => option.countryCode,
		).filter((countryCode) => countryCode !== "EU" && !codes.has(countryCode));
		expect(missing).toEqual([]);
	});
});
