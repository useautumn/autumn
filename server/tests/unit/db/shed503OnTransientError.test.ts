import { describe, expect, mock, test } from "bun:test";
import { shed503OnTransientError } from "@/db/shed503OnTransientError.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const buildContext = () =>
	({
		logger: {
			warn: mock(() => {}),
			error: mock(() => {}),
		},
	}) as unknown as AutumnContext;

const transientError = Object.assign(new Error("connect timeout"), {
	code: "CONNECT_TIMEOUT",
});

describe("shed503OnTransientError", () => {
	test("runs transient failure capture before returning the overload 503", async () => {
		const ctx = buildContext();
		const onTransientError = mock(async () => {});

		await expect(
			shed503OnTransientError({
				ctx,
				source: "get_or_create",
				run: () => {
					throw transientError;
				},
				onTransientError,
			}),
		).rejects.toMatchObject({
			statusCode: 503,
			data: { reason: "critical_db_saturated" },
		});

		expect(onTransientError).toHaveBeenCalledWith(transientError);
	});

	test("does not let recovery queue failure replace the overload response", async () => {
		const ctx = buildContext();

		await expect(
			shed503OnTransientError({
				ctx,
				source: "get_or_create",
				run: () => {
					throw transientError;
				},
				onTransientError: async () => {
					throw new Error("SQS unavailable");
				},
			}),
		).rejects.toMatchObject({
			statusCode: 503,
			data: { reason: "critical_db_saturated" },
		});

		expect(ctx.logger.error).toHaveBeenCalled();
	});

	test("does not capture non-transient application errors", async () => {
		const ctx = buildContext();
		const applicationError = new Error("invalid customer");
		const onTransientError = mock(async () => {});

		await expect(
			shed503OnTransientError({
				ctx,
				source: "get_or_create",
				run: () => {
					throw applicationError;
				},
				onTransientError,
			}),
		).rejects.toBe(applicationError);

		expect(onTransientError).not.toHaveBeenCalled();
	});
});
