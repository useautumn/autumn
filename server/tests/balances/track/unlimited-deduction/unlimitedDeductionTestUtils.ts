import { customerEntitlements } from "@autumn/shared";
import { eq } from "drizzle-orm";
import { db } from "@/db/initDrizzle.js";

export interface RawCusEntRow {
	id: string;
	feature_id: string | null;
	balance: number;
	unlimited: boolean | null;
}

/**
 * Reads the raw `customer_entitlements` rows for a customer straight from
 * Postgres — deliberately bypassing the API, which masks unlimited balances
 * to zero. The unlimited-deduction feature asserts on this raw balance.
 */
export const getRawCusEntRows = async ({
	internalCustomerId,
}: {
	internalCustomerId: string;
}): Promise<RawCusEntRow[]> =>
	db
		.select({
			id: customerEntitlements.id,
			feature_id: customerEntitlements.feature_id,
			balance: customerEntitlements.balance,
			unlimited: customerEntitlements.unlimited,
		})
		.from(customerEntitlements)
		.where(eq(customerEntitlements.internal_customer_id, internalCustomerId));

const POLL_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Track lands in Redis first and flushes to Postgres lazily, so poll the raw
 * cusEnt row until its balance reaches `expectedBalance` (or the timeout
 * elapses — the caller's assertion then reports the last value seen).
 */
export const pollRawCusEntBalance = async ({
	internalCustomerId,
	featureId,
	expectedBalance,
	timeoutMs = POLL_TIMEOUT_MS,
}: {
	internalCustomerId: string;
	featureId: string;
	expectedBalance: number;
	timeoutMs?: number;
}): Promise<RawCusEntRow | undefined> => {
	const deadline = Date.now() + timeoutMs;
	let row: RawCusEntRow | undefined;

	for (;;) {
		const rows = await getRawCusEntRows({ internalCustomerId });
		row = rows.find((r) => r.feature_id === featureId) ?? rows[0];
		if (row && row.balance === expectedBalance) return row;
		if (Date.now() >= deadline) return row;
		await sleep(POLL_INTERVAL_MS);
	}
};
