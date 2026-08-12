import { type ChatApproval, chatApprovals } from "@autumn/shared";
import { and, eq, gt, inArray } from "drizzle-orm";
import type { ChatDb } from "../../../lib/db.js";

const idsOf = (approvals: ChatApproval[]) =>
	approvals.map((approval) => approval.id);

/**
 * Optimistic pending→running claim across the whole group. Returns the rows it
 * won; a short return means another click got there first, so the caller
 * releases and backs off rather than running a subset.
 */
export const claimChatApprovalGroup = async ({
	approvals,
	db,
	providerUserId,
}: {
	approvals: ChatApproval[];
	db: ChatDb;
	providerUserId: string;
}) => {
	if (approvals.length === 0) return [];
	return await db
		.update(chatApprovals)
		.set({
			status: "running",
			decided_at: Date.now(),
			decided_by_provider_user_id: providerUserId,
		})
		.where(
			and(
				inArray(chatApprovals.id, idsOf(approvals)),
				eq(chatApprovals.status, "pending"),
				gt(chatApprovals.expires_at, Date.now()),
			),
		)
		.returning();
};

/**
 * Revert claims the given clicker just made (running→pending) so another user
 * can still decide the group — used when the clicker turns out to lack the
 * Autumn scopes for one of its writes. Scoped to the claimer's own running rows
 * so it can never disturb a claim someone else now holds.
 */
export const releaseChatApprovalGroup = async ({
	approvals,
	db,
	providerUserId,
}: {
	approvals: ChatApproval[];
	db: ChatDb;
	providerUserId: string;
}) => {
	if (approvals.length === 0) return [];
	return await db
		.update(chatApprovals)
		.set({
			status: "pending",
			decided_at: null,
			decided_by_provider_user_id: null,
		})
		.where(
			and(
				inArray(chatApprovals.id, idsOf(approvals)),
				eq(chatApprovals.status, "running"),
				eq(chatApprovals.decided_by_provider_user_id, providerUserId),
			),
		)
		.returning();
};

export const cancelChatApprovalGroup = async ({
	approvals,
	db,
	providerUserId,
}: {
	approvals: ChatApproval[];
	db: ChatDb;
	providerUserId: string;
}) => {
	if (approvals.length === 0) return [];
	return await db
		.update(chatApprovals)
		.set({
			status: "cancelled",
			decided_at: Date.now(),
			decided_by_provider_user_id: providerUserId,
		})
		.where(
			and(
				inArray(chatApprovals.id, idsOf(approvals)),
				eq(chatApprovals.status, "pending"),
			),
		)
		.returning();
};

export const finalizeChatApprovalGroup = async ({
	approvals,
	db,
	providerUserId,
	status,
}: {
	approvals: ChatApproval[];
	db: ChatDb;
	providerUserId: string;
	status: "approved" | "failed";
}) => {
	if (approvals.length === 0) return;
	await db
		.update(chatApprovals)
		.set({
			status,
			decided_at: Date.now(),
			decided_by_provider_user_id: providerUserId,
		})
		.where(inArray(chatApprovals.id, idsOf(approvals)));
};
