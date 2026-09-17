/**
 * One key per sandbox, addressed by the sandbox's own id. Worth pinning: the
 * name is the only link between `--sandbox <id>` and the key in a `.env`, so a
 * change here silently stops finding keys that are already on disk.
 */

import { expect, test } from "bun:test";
import { sandboxKeyName } from "../src/env/sandboxKeyName";

test("the id becomes the middle of the variable name, uppercased", () => {
	expect(sandboxKeyName({ sandboxId: "org_2n4b" })).toBe(
		"AUTUMN_SANDBOX_ORG_2N4B_SECRET_KEY",
	);
});

test("every run of non-alphanumerics folds to a single underscore", () => {
	expect(sandboxKeyName({ sandboxId: "sb-8f2k.eu-west" })).toBe(
		"AUTUMN_SANDBOX_SB_8F2K_EU_WEST_SECRET_KEY",
	);
	expect(sandboxKeyName({ sandboxId: "sb--1" })).toBe(
		"AUTUMN_SANDBOX_SB_1_SECRET_KEY",
	);
});

test("two different ids never collapse onto one variable", () => {
	expect(sandboxKeyName({ sandboxId: "org_a" })).not.toBe(
		sandboxKeyName({ sandboxId: "org_b" }),
	);
});
