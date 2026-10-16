import { describe, expect, test } from "bun:test";
import { createReplicaRing } from "../../../src/replicas/createReplicaRing.js";
import type { PeerResolver } from "../../../src/replication/discovery/createPeerResolver.js";

const A = "10.0.0.1";
const B = "10.0.0.2";
const C = "10.0.0.3";

const customerIds = Array.from({ length: 10_000 }, (_, i) => `cus_${i}`);

const ringOf = ({
	own,
	peers,
}: {
	own: string | string[];
	peers: string[] | Error;
}) => {
	const resolver: PeerResolver = {
		peers: async () => {
			if (peers instanceof Error) throw peers;
			return peers;
		},
		forget: () => {},
	};
	return createReplicaRing({
		ctx: { resolver, own: () => (Array.isArray(own) ? own : [own]) },
	});
};

/** Each replica's view of one deployment: its peers are every member but itself. */
const replicasOf = (members: string[]) =>
	members.map((own) =>
		ringOf({ own, peers: members.filter((member) => member !== own) }),
	);

const ownersOf = (ring: ReturnType<typeof ringOf>) =>
	Promise.all(customerIds.map((customerId) => ring.ownerOf({ customerId })));

describe("the replica that owns a customer", () => {
	test("is the same on every replica that sees the same members, and exactly one replica owns each customer", async () => {
		const replicas = replicasOf([A, B, C]);

		for (const customerId of customerIds.slice(0, 1_000)) {
			const owners = await Promise.all(
				replicas.map((ring) => ring.ownerOf({ customerId })),
			);
			expect(new Set(owners).size).toBe(1);

			const owning = await Promise.all(
				replicas.map((ring) => ring.isOwner({ customerId })),
			);
			expect(owning.filter(Boolean)).toHaveLength(1);
		}
	});

	test("does not change between builds: replicas of a rolling deploy agree", async () => {
		const ring = ringOf({ own: A, peers: [B, C] });

		expect(await ring.ownerOf({ customerId: "cus_1" })).toBe(A);
		expect(await ring.ownerOf({ customerId: "cus_2" })).toBe(B);
		expect(await ring.ownerOf({ customerId: "cus_3" })).toBe(C);
	});

	test("is balanced: each of two replicas owns 40-60% of 10k customers", async () => {
		const owners = await ownersOf(ringOf({ own: A, peers: [B] }));
		const ownedByA = owners.filter((owner) => owner === A).length;

		expect(ownedByA).toBeGreaterThanOrEqual(4_000);
		expect(ownedByA).toBeLessThanOrEqual(6_000);
		expect(owners.filter((owner) => owner === B)).toHaveLength(
			10_000 - ownedByA,
		);
	});

	test("moves about a third of customers when a third replica joins, every one of them to the joiner", async () => {
		const before = await ownersOf(ringOf({ own: A, peers: [B] }));
		const after = await ownersOf(ringOf({ own: A, peers: [B, C] }));

		const movedTo = after.filter((owner, i) => owner !== before[i]);
		expect(movedTo.length).toBeGreaterThanOrEqual(2_800);
		expect(movedTo.length).toBeLessThanOrEqual(3_900);
		expect(new Set(movedTo)).toEqual(new Set([C]));
	});

	test("moves only the leaver's customers when a replica leaves", async () => {
		const before = await ownersOf(ringOf({ own: A, peers: [B, C] }));
		const after = await ownersOf(ringOf({ own: A, peers: [B] }));

		const movedFrom = before.filter((owner, i) => owner !== after[i]);
		expect(movedFrom.length).toBeGreaterThan(0);
		expect(movedFrom).toHaveLength(
			before.filter((owner) => owner === C).length,
		);
		expect(new Set(movedFrom)).toEqual(new Set([C]));
	});

	test("is this replica for every customer while it has no peers, or its peers do not resolve", async () => {
		for (const peers of [[], new Error("ENOTFOUND")]) {
			const ring = ringOf({ own: A, peers });

			expect(await ring.members()).toEqual([A]);
			for (const customerId of customerIds.slice(0, 1_000)) {
				expect(await ring.isOwner({ customerId })).toBe(true);
			}
		}
	});
});

describe("the members of the ring", () => {
	test("are this replica's first address and its peers, sorted, counting this replica once even when the peers list it", async () => {
		const ring = ringOf({ own: [B, "172.17.0.1"], peers: [C, B, A, C] });

		expect(await ring.members()).toEqual([A, B, C]);
	});
});

describe("a customer id", () => {
	test("that is empty is refused", async () => {
		const ring = ringOf({ own: A, peers: [B] });

		await expect(ring.ownerOf({ customerId: "" })).rejects.toThrow(
			"a customer id is required",
		);
		await expect(ring.isOwner({ customerId: "" })).rejects.toThrow(
			"a customer id is required",
		);
	});

	test("in unicode hashes stably, and is owned the same on every replica", async () => {
		const expected = { 客户_2: B, "🙂": A, cus_é: A, "客户_ü_🚀": C };

		for (const [customerId, owner] of Object.entries(expected)) {
			const owners = await Promise.all(
				replicasOf([A, B, C]).map((ring) => ring.ownerOf({ customerId })),
			);
			expect(owners).toEqual([owner, owner, owner]);
		}
	});
});

describe("a replica with no address of its own", () => {
	test("is refused: it could never tell which customers are its own", () => {
		expect(() => ringOf({ own: [], peers: [B] })).toThrow(
			"no address of its own",
		);
	});
});
