import { describe, expect, test } from "bun:test";
import { isRetryableFullSubjectRolloutError } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";

describe("fullSubjectRolloutUtils", () => {
	test("treats retryable DB errors as retryable rollout errors", () => {
		expect(
			isRetryableFullSubjectRolloutError({
				error: Object.assign(new Error("statement timeout"), { code: "57014" }),
			}),
		).toBe(true);
	});

	test("treats ioredis max retries as a retryable rollout error", () => {
		expect(
			isRetryableFullSubjectRolloutError({
				error: Object.assign(new Error("redis retries exhausted"), {
					name: "MaxRetriesPerRequestError",
				}),
			}),
		).toBe(true);
	});

	test("treats ioredis command timeouts as retryable rollout errors", () => {
		expect(
			isRetryableFullSubjectRolloutError({
				error: new Error("Command timed out"),
			}),
		).toBe(true);
	});

	test("does not treat application errors as retryable rollout errors", () => {
		expect(
			isRetryableFullSubjectRolloutError({
				error: Object.assign(new Error("invalid request"), { code: "400" }),
			}),
		).toBe(false);
	});
});
