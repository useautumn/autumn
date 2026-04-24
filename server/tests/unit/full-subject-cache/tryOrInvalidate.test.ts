import { describe, expect, mock, test } from "bun:test";
import { RedisUnavailableError } from "@/external/redis/utils/errors.js";
import { tryOrInvalidate } from "@/internal/customers/cache/fullSubject/tryOrInvalidate.js";

describe("tryOrInvalidate", () => {
	test.concurrent(
		"rethrows RedisUnavailableError without invalidating",
		async () => {
			const invalidate = mock(async () => {});
			const warn = mock(() => {});
			const error = new RedisUnavailableError({
				source: "tryOrInvalidateTest",
				reason: "timeout",
			});

			await expect(
				tryOrInvalidate({
					ctx: { logger: { warn } } as never,
					operation: async () => {
						throw error;
					},
					invalidate,
					warnMessage: "cache miss",
				}),
			).rejects.toBe(error);

			expect(invalidate).not.toHaveBeenCalled();
			expect(warn).not.toHaveBeenCalled();
		},
	);

	test.concurrent("invalidates when operation returns undefined", async () => {
		const invalidate = mock(async () => {});
		const warn = mock(() => {});

		await expect(
			tryOrInvalidate({
				ctx: { logger: { warn } } as never,
				operation: async () => undefined,
				invalidate,
				warnMessage: "cache miss",
			}),
		).resolves.toBeUndefined();

		expect(invalidate).toHaveBeenCalledTimes(1);
		expect(warn).toHaveBeenCalledWith("cache miss");
	});

	test.concurrent("invalidates on non-Redis errors", async () => {
		const invalidate = mock(async () => {});
		const warn = mock(() => {});

		await expect(
			tryOrInvalidate({
				ctx: { logger: { warn } } as never,
				operation: async () => {
					throw new Error("parse failed");
				},
				invalidate,
				warnMessage: "cache miss",
			}),
		).resolves.toBeUndefined();

		expect(invalidate).toHaveBeenCalledTimes(1);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("cache miss, error: Error: parse failed"),
		);
	});
});
