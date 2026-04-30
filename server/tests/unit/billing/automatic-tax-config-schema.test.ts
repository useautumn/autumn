/**
 * OrgConfigSchema must declare `automatic_tax: z.boolean().default(false)`.
 * Without this, Zod strips the field on parse and downstream tests using
 * `s.platform.create({ configOverrides: { automatic_tax: true } })` silently
 * lose the override.
 */

import { describe, expect, test } from "bun:test";
import { OrgConfigSchema } from "@autumn/shared";

describe("OrgConfigSchema.automatic_tax", () => {
	test("defaults to false when not specified", () => {
		const parsed = OrgConfigSchema.parse({});
		expect(parsed.automatic_tax).toBe(false);
	});

	test("accepts true when explicitly set", () => {
		const parsed = OrgConfigSchema.parse({ automatic_tax: true });
		expect(parsed.automatic_tax).toBe(true);
	});

	test("accepts false when explicitly set", () => {
		const parsed = OrgConfigSchema.parse({ automatic_tax: false });
		expect(parsed.automatic_tax).toBe(false);
	});

	test("rejects non-boolean values", () => {
		expect(() => OrgConfigSchema.parse({ automatic_tax: "yes" })).toThrow();
		expect(() => OrgConfigSchema.parse({ automatic_tax: 1 })).toThrow();
	});
});
