import { describe, expect, test } from "bun:test";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import {
	caughtErrorToLogFields,
	logCaughtError,
} from "@/utils/logging/logCaughtError.js";

const createTestLogger = ({
	onError,
	onWarn,
}: {
	onError?: (...args: unknown[]) => void;
	onWarn?: (...args: unknown[]) => void;
}): Logger => ({
	debug: () => {},
	info: () => {},
	warn: (...args: unknown[]) => onWarn?.(...args),
	error: (...args: unknown[]) => onError?.(...args),
	child: () => createTestLogger({ onError, onWarn }),
});

describe("logCaughtError", () => {
	test("logs Error objects to console and logger with stack fields", () => {
		const originalConsoleError = console.error;
		const consoleCalls: unknown[][] = [];
		const loggerCalls: unknown[][] = [];
		const error = new Error("boom");
		const logger = createTestLogger({
			onError: (...args: unknown[]) => loggerCalls.push(args),
		});

		console.error = (...args: unknown[]) => {
			consoleCalls.push(args);
		};

		try {
			logCaughtError({
				logger,
				message: "failed",
				error,
				data: { invoiceId: "in_123" },
			});
		} finally {
			console.error = originalConsoleError;
		}

		expect(consoleCalls).toEqual([["failed", error]]);
		expect(loggerCalls).toHaveLength(1);
		expect(loggerCalls[0][0]).toBe("failed");
		expect(loggerCalls[0][1]).toMatchObject({
			errorName: "Error",
			errorMessage: "boom",
			errorString: "Error: boom",
			data: { invoiceId: "in_123" },
		});
		expect((loggerCalls[0][1] as { errorStack?: string }).errorStack).toContain(
			"Error: boom",
		);
	});

	test("logs non-Error throws through warn", () => {
		const originalConsoleWarn = console.warn;
		const consoleCalls: unknown[][] = [];
		const loggerCalls: unknown[][] = [];
		const logger = createTestLogger({
			onWarn: (...args: unknown[]) => loggerCalls.push(args),
		});

		console.warn = (...args: unknown[]) => {
			consoleCalls.push(args);
		};

		try {
			logCaughtError({
				logger,
				message: "warned",
				error: "bad",
				level: "warn",
			});
		} finally {
			console.warn = originalConsoleWarn;
		}

		expect(consoleCalls).toEqual([["warned", "bad"]]);
		expect(loggerCalls).toEqual([
			[
				"warned",
				{
					errorName: "string",
					errorMessage: "bad",
					errorStack: undefined,
					errorString: "bad",
				},
			],
		]);
	});

	test("normalizes caught values without requiring a logger", () => {
		expect(caughtErrorToLogFields(null)).toEqual({
			errorName: "object",
			errorMessage: "null",
			errorStack: undefined,
			errorString: "null",
		});
	});
});
