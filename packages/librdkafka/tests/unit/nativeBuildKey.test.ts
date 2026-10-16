import { describe, expect, test } from "bun:test";
import { nativeBuildKeyOf } from "../../src/native/nativeBuildKey.js";

const linux = {
	platform: "linux",
	arch: "x64",
	libc: "glibc",
};

describe("nativeBuildKeyOf", () => {
	test("does not depend on the order the sources were read in", () => {
		const forward = new Map([
			["src/a.cc", "a"],
			["src/b.cc", "b"],
		]);
		const backward = new Map([
			["src/b.cc", "b"],
			["src/a.cc", "a"],
		]);
		expect(nativeBuildKeyOf({ sources: forward, ...linux })).toBe(
			nativeBuildKeyOf({ sources: backward, ...linux }),
		);
	});

	test("changes when a patched source changes", () => {
		const before = new Map([["src/a.cc", "uv_rwlock_t lock;"]]);
		const after = new Map([["src/a.cc", "std::shared_mutex lock;"]]);
		expect(nativeBuildKeyOf({ sources: before, ...linux })).not.toBe(
			nativeBuildKeyOf({ sources: after, ...linux }),
		);
	});

	test("an arm64 build never stands in for an x64 one", () => {
		const sources = new Map([["src/a.cc", "a"]]);
		expect(nativeBuildKeyOf({ sources, ...linux })).not.toBe(
			nativeBuildKeyOf({ sources, ...linux, arch: "arm64" }),
		);
	});

	test("a glibc build never stands in for a musl one", () => {
		const sources = new Map([["src/a.cc", "a"]]);
		expect(nativeBuildKeyOf({ sources, ...linux })).not.toBe(
			nativeBuildKeyOf({ sources, ...linux, libc: "musl" }),
		);
	});
});
