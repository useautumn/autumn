import { expect } from "bun:test";
import { balanceLocks, customers } from "@autumn/shared";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { and, eq } from "drizzle-orm";

/** The lock ids Autumn holds open for the customer, read from Postgres. */
export const openLockIdsOf = async ({
	customerId,
}: {
	customerId: string;
}): Promise<string[]> => {
	const rows = await defaultCtx.db
		.select({ lockId: balanceLocks.lock_id })
		.from(balanceLocks)
		.where(
			and(
				eq(balanceLocks.org_id, defaultCtx.org.id),
				eq(balanceLocks.env, defaultCtx.env),
				eq(balanceLocks.customer_id, customerId),
			),
		);
	return rows.map(({ lockId }) => lockId).sort();
};

/** Every seq Autumn holds on the customer's row, across the Atom's journals. */
export const atomSeqsOf = async ({
	customerId,
}: {
	customerId: string;
}): Promise<number[]> => {
	const [row] = await defaultCtx.db
		.select({ atomSeqs: customers.atom_seqs })
		.from(customers)
		.where(
			and(
				eq(customers.org_id, defaultCtx.org.id),
				eq(customers.env, defaultCtx.env),
				eq(customers.id, customerId),
			),
		);
	return Object.values(row?.atomSeqs ?? {}).flatMap((writerSeqs) =>
		Object.values(writerSeqs),
	);
};

/** Autumn's open locks and Atom seqs for the customer settle on exactly these. */
export const expectAutumnLockState = async ({
	customerId,
	openLockIds,
	atomSeqs,
}: {
	customerId: string;
	openLockIds?: string[];
	atomSeqs?: number[];
}): Promise<void> => {
	await pollUntilAsserted({
		fetch: async () => ({
			openLockIds: await openLockIdsOf({ customerId }),
			atomSeqs: await atomSeqsOf({ customerId }),
		}),
		assert: (state) => {
			if (openLockIds) expect(state.openLockIds).toEqual(openLockIds);
			if (atomSeqs) expect(state.atomSeqs).toEqual(atomSeqs);
		},
	});
};
