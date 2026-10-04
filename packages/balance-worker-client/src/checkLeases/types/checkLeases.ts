import type { CheckCommand, MeteringIdentity } from "@autumn/balance-engine";
import type { CheckReply } from "../../contracts/check.js";

export type CheckLeasesConfig = {
	/** Most leased replies held at once; the least recently used goes first. */
	maxEntries: number;
	/** The longest this server answers from one reply, whatever the owner said; defaults to 1 s. */
	maxTtlMs?: number;
};

/** Since the client started; a server's periodic stats log diffs them. */
export type CheckLeaseCounters = {
	/** Checks answered from a held lease, never reaching the owner. */
	leaseHit: number;
	/** Checks sent to the owner. */
	leaseMiss: number;
	/** Owner replies held as a lease. */
	leaseIssued: number;
	/** Refused answers, which are never leased. */
	leaseBypassDenied: number;
	/** Allowed answers not held: the owner withheld a lease (near the limit, guarded, older worker) or it lapsed in flight. */
	leaseWithheld: number;
	/** Leases dropped to keep within `maxEntries`. */
	leaseEvicted: number;
	/** Leases currently held. */
	size: number;
};

export type CheckLeases = {
	/** A held reply for this exact check while its lease lasts; otherwise the owner's, held if it carries one. */
	answer(params: {
		command: CheckCommand;
		send: () => Promise<CheckReply>;
	}): Promise<CheckReply>;
	/** A write from this server: no reply for these customers decided before it ends answers after it. */
	invalidating<Result>(params: {
		identities: readonly MeteringIdentity[];
		run: () => Promise<Result>;
	}): Promise<Result>;
	/** A catalog change from this server: the same, for every customer of the org. */
	invalidatingOrg<Result>(params: {
		orgId: string;
		env: string;
		run: () => Promise<Result>;
	}): Promise<Result>;
	readCounters(): CheckLeaseCounters;
};
