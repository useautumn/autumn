import { and, eq, like } from "drizzle-orm";
import { stripeKeys } from "../../../db/schema/keys.ts";
import type { TwdDb } from "../../../lib/getDb.ts";
import type { TwdTx } from "../../accounts/repos/cleanAccountsRepo.ts";

/** Every lock reason starts with this; syncKeysFromEnv never overwrites a locked key. */
const FULL_NUKE_PREFIX = "full nuke";
export const FULL_NUKE_IN_PROGRESS = `${FULL_NUKE_PREFIX} in progress`;

export const fullNukeLocked = like(
	stripeKeys.unusableReason,
	`${FULL_NUKE_PREFIX}%`,
);

export const isFullNukeLockReason = (reason: string | null): boolean =>
	reason?.startsWith(FULL_NUKE_PREFIX) ?? false;

type KeyProbe = { retrieve?: unknown; v2List?: unknown };

export const unusableReasonFromProbe = ({
	probe,
}: {
	probe: KeyProbe | null;
}): string | null => {
	if (!probe) return "never probed";
	if (probe.retrieve !== "ok") {
		return `account.retrieve failed: ${String(probe.retrieve)}`;
	}
	if (probe.v2List !== "ok") {
		return `v2.core.accounts.list failed (Connect / v2 Accounts API not enabled?): ${String(probe.v2List)}`;
	}
	return null;
};

/** usable=false makes claims, reservations, and top-ups skip the key. */
export const lockKeyForFullNuke = async ({
	db,
	platformAccountId,
	reason = FULL_NUKE_IN_PROGRESS,
}: {
	db: TwdDb | TwdTx;
	platformAccountId: string;
	reason?: string;
}): Promise<void> => {
	await db
		.update(stripeKeys)
		.set({ usable: false, unusableReason: reason, updatedAt: new Date() })
		.where(eq(stripeKeys.platformAccountId, platformAccountId));
};

/** Restores usability from the latest probe. No-op unless the key is full-nuke locked. */
export const releaseFullNukeLock = async ({
	db,
	platformAccountId,
}: {
	db: TwdDb;
	platformAccountId: string;
}): Promise<void> => {
	const [key] = await db
		.select({ probe: stripeKeys.probe, present: stripeKeys.present })
		.from(stripeKeys)
		.where(eq(stripeKeys.platformAccountId, platformAccountId));
	if (!key) return;
	const reason = key.present
		? unusableReasonFromProbe({ probe: key.probe ?? null })
		: "key no longer in TW_V3_KEYS";
	await db
		.update(stripeKeys)
		.set({
			usable: reason === null,
			unusableReason: reason,
			updatedAt: new Date(),
		})
		.where(
			and(eq(stripeKeys.platformAccountId, platformAccountId), fullNukeLocked),
		);
};
