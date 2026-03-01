import type { EntityRolloverBalance, Rollover } from "@autumn/shared";

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
	createdAt = new Date(),
}: {
	id?: string;
	cusEntId: string;
	balance: number;
	usage?: number;
	expiresAt?: number | null;
	entities?: Record<string, EntityRolloverBalance>;
	createdAt?: Date | null;
}): Rollover => ({
	id: id ?? `rollover_${crypto.randomUUID().slice(0, 8)}`,
	cus_ent_id: cusEntId,
	balance,
	usage,
	expires_at: expiresAt,
	entities,
	created_at: createdAt,
});

// ═══════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════

export const rollovers = {
	create,
} as const;
