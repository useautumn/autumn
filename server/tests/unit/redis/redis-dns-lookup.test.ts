import { describe, expect, test } from "bun:test";
import type { LookupOptions } from "node:dns";
import { createRedisDnsLookup } from "@/external/redis/initUtils/redisDnsLookup.js";

const options = { all: false, family: 4 } satisfies LookupOptions;

describe("Redis DNS lookup", () => {
	test("uses the system lookup result when available", async () => {
		const lookup = createRedisDnsLookup({
			lookupHost: (_hostname, _options, callback) => {
				callback(null, "127.0.0.1", 4);
			},
			resolve4Host: () => {
				throw new Error("resolve4 should not run");
			},
		});

		const result = await new Promise<string>((resolve, reject) => {
			lookup("redis.example.com", options, (error, address) => {
				if (error) reject(error);
				else resolve(String(address));
			});
		});

		expect(result).toBe("127.0.0.1");
	});

	test("falls back to resolve4 after ENOTFOUND", async () => {
		const lookup = createRedisDnsLookup({
			lookupHost: (_hostname, _options, callback) => {
				const error = new Error("not found") as NodeJS.ErrnoException;
				error.code = "ENOTFOUND";
				callback(error, "", 4);
			},
			resolve4Host: (_hostname, callback) => {
				callback(null, ["192.0.2.1"]);
			},
		});

		const result = await new Promise<string>((resolve, reject) => {
			lookup("redis.example.com", options, (error, address) => {
				if (error) reject(error);
				else resolve(String(address));
			});
		});

		expect(result).toBe("192.0.2.1");
	});

	test("preserves non-DNS lookup errors", async () => {
		const expected = new Error("permission denied") as NodeJS.ErrnoException;
		expected.code = "EACCES";
		const lookup = createRedisDnsLookup({
			lookupHost: (_hostname, _options, callback) => {
				callback(expected, "", 4);
			},
			resolve4Host: () => {
				throw new Error("resolve4 should not run");
			},
		});

		const error = await new Promise<NodeJS.ErrnoException | null>((resolve) => {
			lookup("redis.example.com", options, (lookupError) => {
				resolve(lookupError);
			});
		});

		expect(error).toBe(expected);
	});
});
