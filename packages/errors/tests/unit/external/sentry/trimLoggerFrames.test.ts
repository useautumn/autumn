import { describe, expect, it } from "bun:test";
import { trimLoggerFrames } from "../../../../src/external/sentry/trimLoggerFrames.js";

const frame = (filename: string) => ({ filename, function: filename });

describe("trimLoggerFrames", () => {
	it("drops the logger's own frames so the caller of logger.error is last", () => {
		const frames = [
			frame("/app/server/src/queue/processMessage.ts"),
			frame("/app/server/src/sync/syncBatching.ts"),
			frame("/app/server/src/external/logtail/logtailUtils.ts"),
			frame("/app/node_modules/pino/pino.js"),
			frame("/app/packages/errors/src/logging/prepareErrorLog.ts"),
		];

		const trimmed = trimLoggerFrames({
			frames,
			loggerFramePaths: ["/external/logtail/"],
		});

		expect(trimmed.map((f) => f.filename)).toEqual([
			"/app/server/src/queue/processMessage.ts",
			"/app/server/src/sync/syncBatching.ts",
		]);
	});

	it("keeps at least one frame", () => {
		const frames = [frame("/app/node_modules/pino/pino.js")];
		expect(trimLoggerFrames({ frames, loggerFramePaths: [] })).toHaveLength(1);
	});
});
