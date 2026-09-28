import { expect, test } from "bun:test";
import { closeFailedWorkerResources } from "../../../src/init/workerResources.js";
import {
	closeStoreFixture,
	createStoreFixture,
	topic,
} from "../kafka/kafka-test-fixtures.js";

test.concurrent(
	"failed resource opening awaits checkpoint teardown before closing SQLite",
	async () => {
		const fixture = createStoreFixture();
		const gate = Promise.withResolvers<void>();
		const cause = new Error("resource assembly failed");
		const events: string[] = [];
		const opening = closeFailedWorkerResources({
			ctx: {
				checkpoints: {
					stop: async () => {
						events.push("checkpoint-stop");
						await gate.promise;
						events.push("checkpoint-settled");
					},
				},
				stateStore: {
					close: () => {
						events.push("sqlite-close");
						fixture.store.close();
					},
				},
				admin: {
					disconnect: async () => {
						events.push("admin-disconnect");
					},
				},
			},
			cause,
		}).catch((error: unknown) => error);
		try {
			await Promise.resolve();
			expect(events).toEqual(["checkpoint-stop"]);
			expect(fixture.store.readNextOffset({ topic, partition: 0 })).toBe(0n);
			gate.resolve();
			expect(await opening).toBe(cause);
			expect(events).toEqual([
				"checkpoint-stop",
				"checkpoint-settled",
				"sqlite-close",
				"admin-disconnect",
			]);
		} finally {
			gate.resolve();
			await opening;
			closeStoreFixture(fixture);
		}
	},
);

test.concurrent.each([false, true])(
	"failed checkpoint teardown preserves SQLite and startup errors, including admin failure=%s",
	async (failDisconnect) => {
		const fixture = createStoreFixture();
		const cause = new Error("resource assembly failed");
		const checkpointFailure = new Error("checkpoint thread did not settle");
		const adminFailure = new Error("admin disconnect failed");
		const events: string[] = [];
		try {
			await expect(
				closeFailedWorkerResources({
					ctx: {
						stateStore: fixture.store,
						checkpoints: {
							stop: async () => {
								events.push("checkpoint-stop");
								throw checkpointFailure;
							},
						},
						admin: {
							disconnect: async () => {
								events.push("admin-disconnect");
								if (failDisconnect) throw adminFailure;
							},
						},
					},
					cause,
				}),
			).rejects.toMatchObject({
				message: "Worker resource opening and cleanup failed",
				errors: failDisconnect
					? [cause, checkpointFailure, adminFailure]
					: [cause, checkpointFailure],
			});
			expect(events).toEqual(["checkpoint-stop", "admin-disconnect"]);
			expect(fixture.store.readNextOffset({ topic, partition: 0 })).toBe(0n);
		} finally {
			closeStoreFixture(fixture);
		}
	},
);

test.concurrent(
	"failed resource opening before SQLite exists still disconnects the admin",
	async () => {
		const cause = new Error("topic validation failed");
		const events: string[] = [];
		await expect(
			closeFailedWorkerResources({
				ctx: {
					admin: {
						disconnect: async () => {
							events.push("admin-disconnect");
						},
					},
				},
				cause,
			}),
		).rejects.toBe(cause);
		expect(events).toEqual(["admin-disconnect"]);
	},
);
