import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import {
	createCheckpointServiceFixture,
	waitForCheckpointService,
} from "./checkpoint-service-fixtures.js";

test.concurrent(
	"the HTTP worker restores S3 after retention and replays a later receipt without charging its retry",
	async () => {
		const fixture = await createCheckpointServiceFixture();
		try {
			const first = await fixture.start({ mode: "enabled", intervalMs: 50 });
			const firstTrack = await fixture.client.track({
				command: fixture.command({ commandId: "checkpointed", value: 5 }),
			});
			expect(firstTrack).toMatchObject({
				kind: "new",
				outcome: { balanceAfter: 5 },
			});
			await waitForCheckpointService({
				ready: async () => {
					const checkpoint = await fixture.latest();
					return (
						checkpoint?.receipts.some(
							(receipt) => receipt.outcome.commandId === "checkpointed",
						) ?? false
					);
				},
			});
			await first.service.stop();
			const checkpoint = await fixture.latest();
			if (!checkpoint) throw new Error("Expected a published checkpoint");
			const tailOwner = await fixture.start({ mode: "restore_only" });
			const command = fixture.command({ commandId: "replayed-tail", value: 3 });
			const tail = await fixture.client.track({ command });
			expect(tail).toMatchObject({ kind: "new", outcome: { balanceAfter: 2 } });
			await tailOwner.service.stop();
			expect((await fixture.latest())?.contentHash).toBe(
				checkpoint.contentHash,
			);
			const range = await fixture.admin.fetchTopicOffsets(fixture.topic);
			expect(BigInt(range[0]?.high ?? "0")).toBeGreaterThan(
				checkpoint.nextOffset,
			);
			await fixture.admin.deleteTopicRecords({
				topic: fixture.topic,
				partitions: [
					{ partition: 0, offset: checkpoint.nextOffset.toString() },
				],
			});
			expect(
				BigInt(
					(await fixture.admin.fetchTopicOffsets(fixture.topic))[0]?.low ?? "0",
				),
			).toBe(checkpoint.nextOffset);
			expect(checkpoint.nextOffset).toBeGreaterThan(0n);
			const replacement = await fixture.start({
				mode: "restore_only",
				file: "replacement.sqlite",
			});
			const retry = await fixture.client.track({ command });
			expect(retry).toMatchObject({
				kind: "duplicate",
				outcome: { balanceAfter: 2 },
			});
			if (tail.kind !== "new" || retry.kind !== "duplicate")
				throw new Error("Expected original and replayed outcomes");
			expect(retry.outcome).toEqual(tail.outcome);
			const database = new Database(replacement.databasePath, {
				readonly: true,
			});
			try {
				expect(
					database.query("SELECT revision FROM customer_states").get(),
				).toEqual({ revision: 2 });
				expect(
					database
						.query("SELECT count(*) AS receipts FROM track_receipts")
						.get(),
				).toEqual({ receipts: 2 });
			} finally {
				database.close();
			}
			expect(fixture.errors).toEqual([]);
		} finally {
			await fixture.close();
		}
	},
	30_000,
);

test.concurrent.each(["restore_only", "enabled"] as const)(
	"a healthy local restart in %s mode serves during an S3 outage without probing S3",
	async (mode) => {
		const fixture = await createCheckpointServiceFixture();
		let requests = 0;
		const unavailable = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			fetch: () => {
				requests++;
				return new Response("S3 unavailable", { status: 503 });
			},
		});
		try {
			const first = await fixture.start({ mode: "off" });
			const command = fixture.command({
				commandId: "before-restart",
				value: 5,
			});
			expect(await fixture.client.track({ command })).toMatchObject({
				kind: "new",
				outcome: { balanceAfter: 5 },
			});
			await first.service.stop();
			await fixture.start({
				mode,
				checkpointEndpoint: `http://127.0.0.1:${unavailable.port}`,
			});
			expect(requests).toBe(0);
			expect(await fixture.client.track({ command })).toMatchObject({
				kind: "duplicate",
				outcome: { balanceAfter: 5 },
			});
			expect(
				await fixture.client.track({
					command: fixture.command({ commandId: "during-outage", value: 3 }),
				}),
			).toMatchObject({ kind: "new", outcome: { balanceAfter: 2 } });
			expect(fixture.errors).toEqual([]);
		} finally {
			await fixture.close();
			await unavailable.stop();
		}
	},
	30_000,
);
