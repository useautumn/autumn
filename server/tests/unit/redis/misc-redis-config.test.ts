import { describe, expect, test } from "bun:test";
import {
	MiscRedisConfigSchema,
	otherMiscRedisInstance,
	toLegacyMiscRedisInstanceName,
} from "@/internal/misc/miscRedisConfig/miscRedisConfigSchemas.js";

describe("MiscRedisConfigSchema", () => {
	test("parses the legacy main-redis-cache payload", () => {
		expect(MiscRedisConfigSchema.parse({ activeInstance: "primary" })).toEqual({
			activeInstance: "main",
			ramp: null,
			backup: null,
		});
		expect(
			MiscRedisConfigSchema.parse({ activeInstance: "fallback" })
				.activeInstance,
		).toBe("backup");
	});

	test("defaults to main with no ramp or backup", () => {
		expect(MiscRedisConfigSchema.parse({})).toEqual({
			activeInstance: "main",
			ramp: null,
			backup: null,
		});
	});

	test("accepts the new instance names untouched", () => {
		for (const name of ["main", "backup"] as const) {
			expect(
				MiscRedisConfigSchema.parse({ activeInstance: name }).activeInstance,
			).toBe(name);
		}
	});

	test("parses a full ramp + backup config", () => {
		const parsed = MiscRedisConfigSchema.parse({
			activeInstance: "main",
			ramp: { percent: 25 },
			backup: {
				publicConnectionString: "encrypted-public",
				url: "host:6379",
			},
		});
		expect(parsed.ramp).toEqual({
			percent: 25,
			previousPercent: 0,
			changedAt: 0,
		});
		expect(parsed.backup).toEqual({
			publicConnectionString: "encrypted-public",
			privateConnectionString: null,
			url: "host:6379",
		});
	});

	test("keeps the backup private connection string when provided", () => {
		const parsed = MiscRedisConfigSchema.parse({
			backup: {
				publicConnectionString: "encrypted-public",
				privateConnectionString: "encrypted-private",
				url: "host:6379",
			},
		});
		expect(parsed.backup?.privateConnectionString).toBe("encrypted-private");
	});

	test("requires the backup public connection string", () => {
		expect(
			MiscRedisConfigSchema.safeParse({
				backup: { privateConnectionString: "encrypted", url: "host:6379" },
			}).success,
		).toBe(false);
	});

	test("rejects out-of-range ramp percents", () => {
		expect(
			MiscRedisConfigSchema.safeParse({ ramp: { percent: 101 } }).success,
		).toBe(false);
	});
});

describe("instance name helpers", () => {
	test("maps new names back to the legacy admin-UI vocabulary", () => {
		expect(toLegacyMiscRedisInstanceName("main")).toBe("primary");
		expect(toLegacyMiscRedisInstanceName("backup")).toBe("fallback");
	});

	test("otherMiscRedisInstance flips between the two instances", () => {
		expect(otherMiscRedisInstance("main")).toBe("backup");
		expect(otherMiscRedisInstance("backup")).toBe("main");
	});
});
