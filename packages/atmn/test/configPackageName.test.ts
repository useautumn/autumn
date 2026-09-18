import { afterEach, expect, test } from "bun:test";
import { configPackageName } from "../src/config/configPackageName";

afterEach(() => {
	delete process.env.ATMN_CONFIG_PACKAGE;
});

test("defaults to the published package name", () => {
	delete process.env.ATMN_CONFIG_PACKAGE;
	expect(configPackageName()).toBe("atmn");
});

test("ATMN_CONFIG_PACKAGE overrides the published specifier", () => {
	process.env.ATMN_CONFIG_PACKAGE = "custom-atmn";
	expect(configPackageName()).toBe("custom-atmn");
});

test("blank override falls back to the published name", () => {
	process.env.ATMN_CONFIG_PACKAGE = "  ";
	expect(configPackageName()).toBe("atmn");
});
