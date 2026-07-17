/** Migration customer locks serialize only the same customer and release after failure. */

import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { ErrCode, RecaseError } from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { withMigrationCustomerLock } from "@/internal/migrations/v2/run/migrateCustomer/withMigrationCustomerLock.js";

const describeWithRedis = process.env.TESTS_ORG ? describe : describe.skip;

const createDeferred = () => {
	let resolve!: () => void;
	const promise = new Promise<void>((resolver) => {
		resolve = resolver;
	});
	return { promise, resolve };
};

const timeout = (milliseconds: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

describeWithRedis("migration customer lock", () => {
	test("releases a failed migration before the follower runs", async () => {
		const customerId = `migration-lock-release-after-failure-${randomUUID()}`;
		const firstEntered = createDeferred();
		const releaseFirst = createDeferred();
		const expectedError = new Error("migration failed");
		let followerEntered = false;

		const first = withMigrationCustomerLock({
			ctx,
			customerId,
			run: async () => {
				firstEntered.resolve();
				await releaseFirst.promise;
				throw expectedError;
			},
		});
		await firstEntered.promise;

		const follower = withMigrationCustomerLock({
			ctx,
			customerId,
			run: async () => {
				followerEntered = true;
				return "follower";
			},
		});

		try {
			await timeout(150);
			expect(followerEntered).toBe(false);
		} finally {
			releaseFirst.resolve();
			await Promise.allSettled([first, follower]);
		}

		await expect(first).rejects.toBe(expectedError);
		expect(await follower).toBe("follower");
	});

	test("does not serialize different customers", async () => {
		const testRunId = randomUUID();
		const firstEntered = createDeferred();
		const releaseFirst = createDeferred();

		const first = withMigrationCustomerLock({
			ctx,
			customerId: `migration-lock-customer-a-${testRunId}`,
			run: async () => {
				firstEntered.resolve();
				await releaseFirst.promise;
				return "first";
			},
		});
		await firstEntered.promise;

		try {
			const second = await Promise.race([
				withMigrationCustomerLock({
					ctx,
					customerId: `migration-lock-customer-b-${testRunId}`,
					run: async () => "second",
				}),
				timeout(250).then(() => "timed-out"),
			]);
			expect(second).toBe("second");
		} finally {
			releaseFirst.resolve();
			await first;
		}
	});

	test("honors a caller-specific wait budget", async () => {
		const customerId = `migration-lock-wait-budget-${randomUUID()}`;
		const firstEntered = createDeferred();
		const releaseFirst = createDeferred();

		const first = withMigrationCustomerLock({
			ctx,
			customerId,
			run: async () => {
				firstEntered.resolve();
				await releaseFirst.promise;
			},
		});
		await firstEntered.promise;

		const followerArgs = {
			ctx,
			customerId,
			maxWaitMs: 50,
			run: async () => "follower",
		};
		const follower = withMigrationCustomerLock(followerArgs);

		try {
			const outcome = await Promise.race([
				follower.then(
					(value) => ({ type: "ran" as const, value }),
					(error: unknown) => ({ type: "rejected" as const, error }),
				),
				timeout(500).then(() => ({ type: "still-waiting" as const })),
			]);

			expect(outcome.type).toBe("rejected");
			if (outcome.type === "rejected") {
				expect(outcome.error).toBeInstanceOf(RecaseError);
				expect((outcome.error as RecaseError).code).toBe(
					ErrCode.LockAlreadyExists,
				);
			}
		} finally {
			releaseFirst.resolve();
			await Promise.allSettled([first, follower]);
		}
	});
});
