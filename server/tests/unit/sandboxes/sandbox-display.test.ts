import { describe, expect, test } from "bun:test";
import {
	DEFAULT_SANDBOX_COLOR,
	DEFAULT_SANDBOX_ICON,
	SANDBOX_COLORS,
	SandboxColorSchema,
	SandboxIconSchema,
} from "@autumn/shared";

describe("sandbox display tokens (shared)", () => {
	test("colour default is a member of the colour allowlist", () => {
		expect(SANDBOX_COLORS).toContain(DEFAULT_SANDBOX_COLOR);
	});

	test("icon default is a non-empty phosphor icon name", () => {
		expect(typeof DEFAULT_SANDBOX_ICON).toBe("string");
		expect(SandboxIconSchema.safeParse(DEFAULT_SANDBOX_ICON).success).toBe(true);
	});

	test("colour schema accepts every allowlisted colour", () => {
		for (const color of SANDBOX_COLORS) {
			expect(SandboxColorSchema.safeParse(color).success).toBe(true);
		}
	});

	test("colour schema rejects colours outside the allowlist", () => {
		expect(SandboxColorSchema.safeParse("chartreuse").success).toBe(false);
		expect(SandboxColorSchema.safeParse("#ff0000").success).toBe(false);
	});

	test("icon schema accepts an arbitrary phosphor name but rejects empty", () => {
		expect(SandboxIconSchema.safeParse("Rocket").success).toBe(true);
		expect(SandboxIconSchema.safeParse("Bug").success).toBe(true);
		expect(SandboxIconSchema.safeParse("").success).toBe(false);
	});
});
