import type { PeerResolver } from "../replication/discovery/createPeerResolver.js";
import type { Membership } from "./membership/types/membership.js";
import type { ReplicaRing } from "./types/replicaRing.js";

/** Rendezvous score: the same slot hash, over a key no address can collide into ("/" never appears in one). */
const scoreOf = ({
	member,
	customerId,
}: {
	member: string;
	customerId: string;
}): number => Bun.hash.xxHash32(`${member}/${customerId}`);

const bestOf = ({
	members,
	customerId,
}: {
	members: string[];
	customerId: string;
}): string | null => {
	let owner: string | null = null;
	let best = -1;
	// Sorted members and a strict > break a tie toward the lowest address.
	for (const member of members) {
		const score = scoreOf({ member, customerId });
		if (score > best) {
			owner = member;
			best = score;
		}
	}
	return owner;
};

/**
 * A customer belongs to the member with the highest score for it, so a join or leave moves only the customers whose
 * top member changed: 1/N of them. No election and no stored owner; peers come from the resolver's DNS view, counted as
 * members until the membership says they are leaving, and this replica counts until it leaves.
 */
export const createReplicaRing = ({
	ctx,
}: {
	ctx: {
		resolver: Pick<PeerResolver, "peers">;
		own: () => string[];
		membership?: Membership;
	};
}): ReplicaRing => {
	const self = ctx.own()[0];
	if (self === undefined)
		throw new Error(
			"a replica with no address of its own cannot own customers",
		);
	const { membership } = ctx;

	const peersListed = async (): Promise<string[]> =>
		[...new Set(await ctx.resolver.peers().catch(() => []))].filter(
			(peer) => peer !== self,
		);

	async function members(): Promise<string[]> {
		const peers = (await peersListed()).filter(
			(peer) => !membership || membership.isMember(peer),
		);
		const own = membership?.isSelfLeaving() ? [] : [self];
		return [...own, ...peers].sort();
	}

	async function ownerOf({
		customerId,
	}: {
		customerId: string;
	}): Promise<string> {
		if (customerId === "")
			throw new Error("a customer id is required to find its owner replica");
		return bestOf({ members: await members(), customerId }) ?? self;
	}

	return {
		self,
		ownerOf,
		isOwner: async ({ customerId }) => (await ownerOf({ customerId })) === self,
		members,
	};
};
