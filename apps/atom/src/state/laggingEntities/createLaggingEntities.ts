import { seenSeqOf } from "../journal/seenSeqOf.js";
import type { StoredSubject } from "../types/storedSubject.js";

/** Per writer, the highest seq the entity's own copy must show. */
type Expected = Map<string, number>;

/**
 * Entities whose copy has not caught up with an entry a push already trimmed: Autumn pushes a customer and each of its
 * entities apart, so the customer's copy can show an entity's deduction before the entity's copy does. Memory only.
 */
export const createLaggingEntities = () => {
	const byCustomer = new Map<string, Map<string, Expected>>();

	function expect({
		customerId,
		entityId,
		writerId,
		seq,
	}: {
		customerId: string;
		entityId: string;
		writerId: string;
		seq: number;
	}): void {
		const entities = byCustomer.get(customerId) ?? new Map<string, Expected>();
		const expected = entities.get(entityId) ?? new Map<string, number>();
		expected.set(writerId, Math.max(seq, expected.get(writerId) ?? 0));
		entities.set(entityId, expected);
		byCustomer.set(customerId, entities);
	}

	/** After a push: an entity whose copy now shows every seq expected of it, or that is no longer held, lags no more. */
	function settle({
		customerId,
		copyOf,
	}: {
		customerId: string;
		copyOf: (entityId: string) => StoredSubject | null;
	}): void {
		const entities = byCustomer.get(customerId);
		if (!entities) return;
		for (const [entityId, expected] of entities) {
			const copy = copyOf(entityId);
			const atomSeqs = copy?.state.customer.atom_seqs;
			const caughtUp = [...expected].every(
				([writerId, seq]) => seenSeqOf({ atomSeqs, writerId }) >= seq,
			);
			if (!copy || caughtUp) entities.delete(entityId);
		}
		if (entities.size === 0) byCustomer.delete(customerId);
	}

	function isLagging({
		customerId,
		entityId,
	}: {
		customerId: string;
		entityId: string;
	}): boolean {
		return byCustomer.get(customerId)?.has(entityId) === true;
	}

	function hasLagging({ customerId }: { customerId: string }): boolean {
		return byCustomer.has(customerId);
	}

	return { expect, settle, isLagging, hasLagging };
};

export type LaggingEntities = ReturnType<typeof createLaggingEntities>;
