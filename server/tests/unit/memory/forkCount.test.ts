import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { getServerForkCount } from "@/utils/memory/forkRecycling/recyclePolicy.js";

describe("getServerForkCount", () => {
	let saved: string | undefined;
	beforeEach(() => {
		saved = process.env.SERVER_FORK_COUNT;
		delete process.env.SERVER_FORK_COUNT;
	});
	afterEach(() => {
		if (saved === undefined) delete process.env.SERVER_FORK_COUNT;
		else process.env.SERVER_FORK_COUNT = saved;
	});

	test("defaults to 3", () => {
		expect(getServerForkCount()).toBe(3);
	});

	test("honors a valid override", () => {
		process.env.SERVER_FORK_COUNT = "6";
		expect(getServerForkCount()).toBe(6);
	});

	test("clamps garbage, zero, negatives, and absurd values to sane bounds", () => {
		process.env.SERVER_FORK_COUNT = "0";
		expect(getServerForkCount()).toBe(3);
		process.env.SERVER_FORK_COUNT = "-2";
		expect(getServerForkCount()).toBe(3);
		process.env.SERVER_FORK_COUNT = "not-a-number";
		expect(getServerForkCount()).toBe(3);
		process.env.SERVER_FORK_COUNT = "64";
		expect(getServerForkCount()).toBe(8);
	});
});
