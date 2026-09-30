import { keyGate } from "../../../db/schema/keys.ts";
import type { TwdDb } from "../../../lib/getDb.ts";
import type { KeyGate } from "../types/keyGate.ts";

const GATE_ID = "global";

export const getKeyGate = async ({ db }: { db: TwdDb }): Promise<KeyGate> => {
	const [row] = await db.select().from(keyGate).limit(1);
	return {
		state: row?.state ?? "open",
		reason: row?.reason ?? null,
		jobId: row?.jobId ?? null,
	};
};

export const setKeyGate = async ({
	db,
	gate,
}: {
	db: TwdDb;
	gate: KeyGate;
}): Promise<void> => {
	const fields = { ...gate, updatedAt: new Date() };
	await db
		.insert(keyGate)
		.values({ id: GATE_ID, ...fields })
		.onConflictDoUpdate({ target: keyGate.id, set: fields });
};
