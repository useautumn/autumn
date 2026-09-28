import { expect, test } from "bun:test";
import { seedGroupPlaces } from "../../../src/stream/seedGroupPlaces.js";

const topic = "local-events";
const groupId = "local-herald-usage-events";
const logger = { info: () => {} };

/** A broker's view of one group: what it has committed, and where each partition ends. */
const createFakeAdmin = ({
	committed,
	ends,
	refuseSetOffsets,
}: {
	committed: Record<number, string>;
	ends: Record<number, string>;
	refuseSetOffsets?: () => void;
}) => {
	const calls: string[] = [];
	const state = { committed: { ...committed } };
	const admin = {
		connect: async () => {
			calls.push("connect");
		},
		disconnect: async () => {
			calls.push("disconnect");
		},
		fetchOffsets: async () => [
			{
				topic,
				partitions: Object.entries(state.committed).map(
					([partition, offset]) => ({
						partition: Number(partition),
						offset,
						metadata: null,
					}),
				),
			},
		],
		fetchTopicOffsets: async () =>
			Object.entries(ends).map(([partition, high]) => ({
				partition: Number(partition),
				offset: high,
				high,
				low: "0",
			})),
		setOffsets: async ({
			partitions,
		}: {
			partitions: { partition: number; offset: string }[];
		}) => {
			calls.push(
				`setOffsets:${partitions.map(({ partition, offset }) => `${partition}=${offset}`).join(",")}`,
			);
			refuseSetOffsets?.();
			for (const { partition, offset } of partitions)
				state.committed[partition] = offset;
		},
	};
	return { admin, calls, state };
};

test("a job with a place on any partition keeps it, even where other partitions have none", async () => {
	const { admin, calls } = createFakeAdmin({
		committed: { 0: "42", 1: "-1" },
		ends: { 0: "100", 1: "7" },
	});
	const outcome = await seedGroupPlaces({
		ctx: { admin, logger },
		groupId,
		topic,
	});
	expect(outcome).toBe("kept");
	expect(calls).toEqual(["connect", "disconnect"]);
});

test("a job with no place anywhere is seeded at the end of every partition", async () => {
	const { admin, calls } = createFakeAdmin({
		committed: { 0: "-1", 1: "-1" },
		ends: { 0: "100", 1: "7" },
	});
	const outcome = await seedGroupPlaces({
		ctx: { admin, logger },
		groupId,
		topic,
	});
	expect(outcome).toBe("seeded");
	expect(calls).toEqual(["connect", "setOffsets:0=100,1=7", "disconnect"]);
});

test("a sibling that seeded and joined first wins: the refused seed is kept, not retried", async () => {
	const fake = createFakeAdmin({
		committed: { 0: "-1" },
		ends: { 0: "100" },
		refuseSetOffsets: () => {
			// The sibling committed between our read and our write, and is now an active member.
			fake.state.committed[0] = "100";
			throw new Error("The consumer group must have no running instances");
		},
	});
	const outcome = await seedGroupPlaces({
		ctx: { admin: fake.admin, logger },
		groupId,
		topic,
	});
	expect(outcome).toBe("kept");
});

test("a refused seed with still no place anywhere is an error: the job never starts from the beginning by accident", async () => {
	const fake = createFakeAdmin({
		committed: { 0: "-1" },
		ends: { 0: "100" },
		refuseSetOffsets: () => {
			throw new Error("The consumer group must have no running instances");
		},
	});
	await expect(
		seedGroupPlaces({ ctx: { admin: fake.admin, logger }, groupId, topic }),
	).rejects.toThrow("running instances");
	expect(fake.calls.at(-1)).toBe("disconnect");
});
