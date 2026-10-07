import { describe, expect, test } from "bun:test";
import { createUnknownKeysLog } from "../../../src/logging/createUnknownKeysLog.js";

function createFixture() {
	const lines: unknown[] = [];
	let now = 0;
	const log = createUnknownKeysLog({
		ctx: {
			logger: { info: (entry: unknown) => lines.push(entry) } as never,
			now: () => now,
		},
		config: { everyMs: 1_000 },
	});
	return {
		log,
		lines,
		advance: (ms: number) => {
			now += ms;
		},
	};
}

describe("unknown keys log", () => {
	test("logs a source's key set once per window, then how often it repeated", () => {
		const { log, lines, advance } = createFixture();
		const evict = { source: "/v1/evict", keyPaths: ["refreshSnapshots"] };

		log.record(evict);
		log.record(evict);
		log.record(evict);
		advance(1_000);
		log.record(evict);

		expect(lines).toEqual([
			{
				event: "balance_worker.unknown_keys_stripped",
				...evict,
				repeatsSinceLastLine: 0,
			},
			{
				event: "balance_worker.unknown_keys_stripped",
				...evict,
				repeatsSinceLastLine: 2,
			},
		]);
	});

	test("another source or key set gets its own line", () => {
		const { log, lines } = createFixture();

		log.record({ source: "/v1/evict", keyPaths: ["refreshSnapshots"] });
		log.record({ source: "/v1/evict", keyPaths: ["org.config.newFlag"] });
		log.record({
			source: "commandTopic.track",
			keyPaths: ["refreshSnapshots"],
		});

		expect(lines).toHaveLength(3);
	});
});
