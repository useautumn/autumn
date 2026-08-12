import { chatApprovals } from "@autumn/shared";
import { asc, eq } from "drizzle-orm";
import type { ChatDb } from "../../../lib/db.js";
import { getChatApproval } from "./getChatApproval.js";

const byGroupId = async ({ db, groupId }: { db: ChatDb; groupId: string }) =>
	await db.query.chatApprovals.findMany({
		where: eq(chatApprovals.group_id, groupId),
		orderBy: [asc(chatApprovals.created_at), asc(chatApprovals.id)],
	});

/**
 * The approvals decided together on one card, oldest first. Accepts either a
 * row id (what a card button carries) or a group id (what a chained resume
 * returns). Rows predating the group column are their own group of one.
 */
export const getChatApprovalGroup = async ({
	approvalId,
	db,
}: {
	approvalId: string;
	db: ChatDb;
}) => {
	const approval = await getChatApproval({ approvalId, db });
	if (!approval) return await byGroupId({ db, groupId: approvalId });
	if (!approval.group_id) return [approval];
	return await byGroupId({ db, groupId: approval.group_id });
};
