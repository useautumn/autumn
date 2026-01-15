import type {
	EntityRolloverBalance,
	Rollover,
} from "@autumn/shared";

/**
 * Create a rollover fixture
 */
const create = ({
	id,
	cusEntId,
	balance,
	usage = 0,
	expiresAt = null,
	entities = {},
}: {
	id?: string;
	cusEntId: string;
	balance: number;
	usage?: number;
	expiresAt?: number | null;
	entities?: Record<string, EntityRolloverBalance>;
}): Rollover => ({
	id: id ?? `rollover_${crypto.randomUUID().slice(0, 8)}`,
	cus_ent_id: cusEntId,
	balance,
	usage,
	expires_at: expiresAt,
	entities,
});

// ═══════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════

export const rollovers = {
	create,
} as const;

