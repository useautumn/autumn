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
 * members only while the membership says so (joined, not leaving), and this replica counts until it leaves.
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

	/** The leaving peer the customer came from, when this replica owns it only because that peer is leaving. */
	async function movedFrom({
		customerId,
	}: {
		customerId: string;
	}): Promise<string | null> {
		if (!membership) return null;
		const leaving = (await peersListed()).filter((peer) =>
			membership.isLeaving(peer),
		);
		if (leaving.length === 0) return null;
		const before = bestOf({
			members: [...(await members()), ...leaving].sort(),
			customerId,
		});
		return before !== null && leaving.includes(before) ? before : null;
	}

	/** Who owns the customer once this replica has left: where what it holds for the customer is sent ahead of the leave. */
	async function ownerAfterLeaving({
		customerId,
	}: {
		customerId: string;
	}): Promise<string | null> {
		const others = (await members()).filter((member) => member !== self);
		return bestOf({ members: others, customerId });
	}

	/** Who owns the customer once `peer` counts: where its entries go before the peer is counted. */
	async function ownerOnceJoined({
		customerId,
		peer,
	}: {
		customerId: string;
		peer: string;
	}): Promise<string> {
		const joined = [...new Set([...(await members()), peer])].sort();
		return bestOf({ members: joined, customerId }) ?? self;
	}

	return {
		self,
		ownerOf,
		isOwner: async ({ customerId }) => (await ownerOf({ customerId })) === self,
		members,
		movedFrom,
		ownerAfterLeaving,
		ownerOnceJoined,
	};
};
