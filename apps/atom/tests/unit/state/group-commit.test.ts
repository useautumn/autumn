import { describe, expect, test } from "bun:test";
import { createGroupCommit } from "../../../src/state/journal/createGroupCommit.js";

/** A commit the test finishes by hand, so appends can arrive while it is in flight. */
const heldCommits = () => {
	const batches: number[][] = [];
	const releases: (() => void)[] = [];
	const commit = (items: number[]) => {
		batches.push(items);
		const { promise, resolve } = Promise.withResolvers<void>();
		releases.push(resolve);
		return promise;
	};
	const releaseNext = async () => {
		while (releases.length === 0) await Bun.sleep(1);
		releases.shift()?.();
	};
	return { batches, commit, releaseNext };
};

describe("group commit", () => {
	test("N appends arriving during one in-flight commit land in one transaction", async () => {
		const { batches, commit, releaseNext } = heldCommits();
		const groupCommit = createGroupCommit({ commit });

		const first = groupCommit.add(0);
		while (batches.length === 0) await Bun.sleep(1);
		const during = Array.from({ length: 50 }, (_, index) =>
			groupCommit.add(index + 1),
		);
		await releaseNext();
		await first;
		await releaseNext();
		await Promise.all(during);

		expect(batches).toEqual([
			[0],
			Array.from({ length: 50 }, (_, index) => index + 1),
		]);
	});

	test("appends made in one turn share one commit", async () => {
		const batches: number[][] = [];
		const groupCommit = createGroupCommit({
			commit: (items: number[]) => {
				batches.push(items);
			},
		});

		await Promise.all([1, 2, 3].map((item) => groupCommit.add(item)));

		expect(batches).toEqual([[1, 2, 3]]);
	});

	test("an append resolves only after its own commit", async () => {
		const { batches, commit, releaseNext } = heldCommits();
		const groupCommit = createGroupCommit({ commit });
		let acked = false;

		const append = groupCommit.add(1).then(() => {
			acked = true;
		});
		while (batches.length === 0) await Bun.sleep(1);
		await Bun.sleep(5);
		expect(acked).toBe(false);

		await releaseNext();
		await append;
		expect(acked).toBe(true);
	});

	test("a failed commit rejects every append in it, and the next commit still runs", async () => {
		const batches: number[][] = [];
		const groupCommit = createGroupCommit({
			commit: (items: number[]) => {
				batches.push(items);
				if (items.includes(2)) throw new Error("disk full");
			},
		});

		const failed = await Promise.allSettled([
			groupCommit.add(1),
			groupCommit.add(2),
		]);
		await groupCommit.add(3);

		expect(failed.map(({ status }) => status)).toEqual([
			"rejected",
			"rejected",
		]);
		expect(batches).toEqual([[1, 2], [3]]);
	});
});
