import type { AtomRecord } from "./atomRecord.js";

/** Where one Atom's record is kept: an org's `atom_deployments` row, or the shadow Atom's edge config. */
export type AtomStorage<T extends AtomRecord> = {
	/** The record as stored now; null once it is forgotten. */
	find(): Promise<T | null>;
	/** Writes `to` over the record as `from` read it; a no-op once the record moved on. */
	update(params: { from: T; to: T }): Promise<void>;
	/** Forgets a record whose removal finished. */
	forget(params: { record: T }): Promise<void>;
};
