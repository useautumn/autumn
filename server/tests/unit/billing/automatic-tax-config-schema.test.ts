/**
 * TDD test for the `automatic_tax` field on OrgConfigSchema.
 *
 * Red-failure mode (current behavior, pre-fix):
 *  - OrgConfigSchema does not declare an `automatic_tax` field.
 *  - Zod strips unknown keys by default, so `OrgConfigSchema.parse({ automatic_tax: true })`
 *    returns an object whose `.automatic_tax` is `undefined`.
 *  - Result: `expect(parsed.automatic_tax).toBe(false)` fails.
 *
 * Green-success criteria (after fix):
 *  - OrgConfigSchema includes `automatic_tax: z.boolean().default(false)`.
 *  - Parsing `{}` yields `{ ..., automatic_tax: false }`.
 *  - Parsing `{ automatic_tax: true }` yields `{ ..., automatic_tax: true }`.
 *  - Parsing `{ automatic_tax: "yes" }` (non-boolean) throws.
 *
 * Why this matters: every downstream Phase 1 cycle uses
 * `s.platform.create({ configOverrides: { automatic_tax: true } })`. If the
 * schema doesn't know about the field, Zod silently drops it during parse and
 * the org's runtime config never has `automatic_tax: true` — making the rest
 * of the rollout impossible to test.
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
