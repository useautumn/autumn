import type { PeerResolver } from "../replication/discovery/createPeerResolver.js";
import type { ReplicaRing } from "./types/replicaRing.js";

/** Rendezvous score: the same slot hash, over a key no address can collide into ("/" never appears in one). */
const scoreOf = ({
	member,
	customerId,
}: {
	member: string;
	customerId: string;
}): number => Bun.hash.xxHash32(`${member}/${customerId}`);

/**
 * A customer belongs to the member with the highest score for it, so a join or leave moves only the customers whose
 * top member changed: 1/N of them. No election and no stored owner; peers come from the resolver's DNS view.
 */
export const createReplicaRing = ({
	ctx,
}: {
	ctx: { resolver: PeerResolver; own: () => string[] };
}): ReplicaRing => {
	const self = ctx.own()[0];
	if (self === undefined)
		throw new Error(
			"a replica with no address of its own cannot own customers",
		);

	async function members(): Promise<string[]> {
		const peers = await ctx.resolver.peers().catch(() => []);
		return [...new Set([self, ...peers])].sort();
	}

	async function ownerOf({
		customerId,
	}: {
		customerId: string;
	}): Promise<string> {
		if (customerId === "")
			throw new Error("a customer id is required to find its owner replica");
		let owner = self;
		let best = -1;
		// Sorted members and a strict > break a tie toward the lowest address.
		for (const member of await members()) {
			const score = scoreOf({ member, customerId });
			if (score > best) {
				owner = member;
				best = score;
			}
		}
		return owner;
	}

	return {
		ownerOf,
		isOwner: async ({ customerId }) => (await ownerOf({ customerId })) === self,
		members,
	};
};
