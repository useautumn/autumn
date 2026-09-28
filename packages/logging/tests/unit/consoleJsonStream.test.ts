import { describe, expect, test } from "bun:test";
import {
	closeSync,
	mkdtempSync,
	openSync,
	readFileSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConsoleJsonStream } from "../../src/streams/consoleJsonStream.js";

function openTempLog() {
	const directory = mkdtempSync(join(tmpdir(), "autumn-console-json-"));
	const path = join(directory, "out.log");
	const fd = openSync(path, "w");
	return {
		fd,
		read: () => readFileSync(path, "utf8"),
		close: () => {
			closeSync(fd);
			rmSync(directory, { recursive: true, force: true });
		},
	};
}

describe("console json stream", () => {
	test("lines land on the fd once flushed, and nothing is dropped when there is room", async () => {
		const log = openTempLog();
		try {
			const stream = createConsoleJsonStream({ fd: log.fd });
			for (let index = 0; index < 100; index++)
				stream.write(`{"n":${index}}\n`);
			await stream.flush();
			expect(log.read().split("\n").filter(Boolean)).toHaveLength(100);
			expect(stream.dropped()).toBe(0);
		} finally {
			log.close();
		}
	});

	test("past the buffer bound, lines are dropped instead of blocking, then the drop count is reported", async () => {
		const log = openTempLog();
		try {
			const stream = createConsoleJsonStream({
				fd: log.fd,
				maxBufferBytes: 256,
				minWriteBytes: 0,
				dropReportIntervalMs: 5,
			});
			// One synchronous burst: the first write goes out on the thread pool, the rest queue behind it.
			for (let index = 0; index < 200; index++)
				stream.write(`{"n":${index},"pad":"${"x".repeat(40)}"}\n`);
			expect(stream.dropped()).toBeGreaterThan(0);
			await new Promise((resolve) => setTimeout(resolve, 40));
			await stream.flush();
			const lines = log.read().split("\n").filter(Boolean);
			expect(lines.length).toBeLessThan(200);
			const report = lines.find((line) => line.includes("Log lines dropped"));
			expect(report).toBeDefined();
			expect(JSON.parse(report ?? "{}")).toMatchObject({
				level: "WARN",
				dropped: stream.dropped(),
			});
		} finally {
			log.close();
		}
	});
});
