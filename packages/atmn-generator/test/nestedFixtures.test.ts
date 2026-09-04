import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NESTED_FIXTURES } from "../src/collections";

const generated = join(import.meta.dir, "../../atmn-nightly/src/generated");

test("every nested fixture has a generated module with its builder and type", () => {
	for (const [name, meta] of Object.entries(NESTED_FIXTURES)) {
		const path = join(generated, `${name}.ts`);
		expect(existsSync(path)).toBe(true);
		const source = readFileSync(path, "utf8");
		expect(source).toContain(`export type ${meta.typeName} = {`);
		expect(source).toContain(
			`export const ${meta.builder} = (input: ${meta.typeName}): ${meta.typeName} => input;`,
		);
	}
});

test("a nested fixture's hidden fields stay hidden through its own module", () => {
	// `variants.new_plan_id` is overlay-hidden on plans, so the Variant type must not carry it.
	const source = readFileSync(join(generated, "variants.ts"), "utf8");
	expect(source).not.toContain("newPlanId");
	expect(source).toContain("variantPlanId: string;");
});
