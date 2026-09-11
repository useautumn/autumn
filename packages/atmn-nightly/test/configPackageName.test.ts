import { afterEach, expect, test } from "bun:test";
import { configPackageName } from "../src/config/configPackageName";

afterEach(() => {
	delete process.env.ATMN_CONFIG_PACKAGE;
});

test("defaults to the published package name", () => {
	delete process.env.ATMN_CONFIG_PACKAGE;
	expect(configPackageName()).toBe("atmn-nightly");
});

test("ATMN_CONFIG_PACKAGE=atmn is the local / eval specifier", () => {
	process.env.ATMN_CONFIG_PACKAGE = "atmn";
	expect(configPackageName()).toBe("atmn");
});

test("blank override falls back to the published name", () => {
	process.env.ATMN_CONFIG_PACKAGE = "  ";
	expect(configPackageName()).toBe("atmn-nightly");
});
