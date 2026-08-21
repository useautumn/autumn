import { describe, expect, test } from "bun:test";
import { InMemorySnapshotStore } from "@/internal/metering/snapshot/inMemorySnapshotStore.js";
import { FencedError } from "@/internal/metering/snapshot/snapshotStore.js";

describe("InMemorySnapshotStore epoch fencing", () => {
	test("getLatest is null before anything is written", async () => {
		const store = new InMemorySnapshotStore();

		expect(await store.getLatest({ partition: 0 })).toBeNull();
	});

	test("put then getLatest returns the newest snapshot for that partition", async () => {
		const store = new InMemorySnapshotStore();

		await store.put({ partition: 0, epoch: 1, offset: 10, data: "first" });
		await store.put({ partition: 0, epoch: 1, offset: 20, data: "second" });

		expect(await store.getLatest({ partition: 0 })).toEqual({
			partition: 0,
			epoch: 1,
			offset: 20,
			data: "second",
		});
	});

	test("partitions are isolated", async () => {
		const store = new InMemorySnapshotStore();

		await store.put({ partition: 0, epoch: 1, offset: 10, data: "p0" });
		await store.put({ partition: 1, epoch: 9, offset: 99, data: "p1" });

		expect((await store.getLatest({ partition: 0 }))?.data).toBe("p0");
		expect((await store.getLatest({ partition: 1 }))?.epoch).toBe(9);
	});

	test("a stale writer is fenced once a new owner has bumped the epoch", async () => {
		const store = new InMemorySnapshotStore();
		await store.put({ partition: 0, epoch: 1, offset: 10, data: "old-owner" });

		const stored = await store.getLatest({ partition: 0 });
		const newEpoch = (stored?.epoch ?? 0) + 1;
		await store.put({
			partition: 0,
			epoch: newEpoch,
			offset: 12,
			data: "new-owner",
		});

		const stalePut = store.put({
			partition: 0,
			epoch: 1,
			offset: 11,
			data: "old-owner-again",
		});

		await expect(stalePut).rejects.toBeInstanceOf(FencedError);
		expect((await store.getLatest({ partition: 0 }))?.data).toBe("new-owner");
	});

	test("the current owner may keep writing at its own epoch", async () => {
		const store = new InMemorySnapshotStore();

		await store.put({ partition: 0, epoch: 2, offset: 10, data: "a" });
		await store.put({ partition: 0, epoch: 2, offset: 20, data: "b" });

		expect((await store.getLatest({ partition: 0 }))?.offset).toBe(20);
	});

	test("FencedError names the partition and both epochs", async () => {
		const store = new InMemorySnapshotStore();
		await store.put({ partition: 4, epoch: 7, offset: 1, data: "owner" });

		try {
			await store.put({ partition: 4, epoch: 6, offset: 2, data: "stale" });
			throw new Error("expected FencedError");
		} catch (error) {
			expect(error).toBeInstanceOf(FencedError);
			expect((error as FencedError).partition).toBe(4);
			expect((error as FencedError).epoch).toBe(6);
			expect((error as FencedError).storedEpoch).toBe(7);
		}
	});
});
