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
	/** Checks answered from a lease held in this process, never reaching the owner. */
	leaseHit: number;
	/** Checks answered from a lease another server published, never reaching the owner. */
	leaseSharedHit: number;
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
	/** Shared store reads or writes that failed or timed out; the check went to the owner. */
	leaseSharedErrors: number;
	/** Leases currently held. */
	size: number;
};

/** Where servers share leased replies, so one owner call per key answers the fleet until its deadline. */
export type SharedCheckLeases = {
	/** The stored value and its remaining life; null when absent. */
	read(params: {
		key: string;
	}): Promise<{ value: string; ttlMs: number } | null>;
	write(params: { key: string; value: string; ttlMs: number }): Promise<void>;
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
