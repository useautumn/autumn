import crypto from "node:crypto";
import {
	type ChatApprovalWrite,
	type ChatApprovalWriteStatus,
	chatApprovals,
	chatApprovalWrites,
} from "@autumn/shared";
import { and, asc, desc, eq, exists, gt, inArray, or, sql } from "drizzle-orm";
import type { ChatDb } from "../../../lib/db.js";
import { normalizeToolName } from "../../agentRuntime/tools/toolPolicy.js";

export type InsertApprovalWrite = {
	denyOptionId?: string;
	preview?: unknown;
	requestId?: string;
	toolArgs: Record<string, unknown>;
	toolName: string;
};

const insertSteps = async ({
	approvalId,
	db,
	steps,
}: {
	approvalId: string;
	db: ChatDb;
	steps: ReadonlyArray<InsertApprovalWrite>;
}) => {
	if (!steps.length) return;
	await db.insert(chatApprovalWrites).values(
		steps.map((step, position) => ({
			id: `chat_apw_${crypto.randomUUID().replace(/-/g, "")}`,
			approval_id: approvalId,
			position,
			request_id: step.requestId,
			deny_option_id: step.denyOptionId,
			tool_name: normalizeToolName(step.toolName),
			tool_args: step.toolArgs,
			preview: step.preview,
			status: "pending" as const,
			created_at: Date.now(),
			updated_at: Date.now(),
		})),
	);
};

const listSteps = async ({
	approvalId,
	db,
}: {
	approvalId: string;
	db: ChatDb;
}): Promise<ChatApprovalWrite[]> =>
	db
		.select()
		.from(chatApprovalWrites)
		.where(eq(chatApprovalWrites.approval_id, approvalId))
		.orderBy(asc(chatApprovalWrites.position));

const parentIsPending = (db: ChatDb, approvalId: string) =>
	exists(
		db
			.select({ id: chatApprovals.id })
			.from(chatApprovals)
			.where(
				and(
					eq(chatApprovals.id, approvalId),
					eq(chatApprovals.status, "pending"),
				),
			),
	);

/** Pending-guarded on step AND parent: a resolved card keeps exactly what it
 * was approved with. */
const setStepPreview = async ({
	approvalId,
	db,
	preview,
	writeId,
}: {
	approvalId: string;
	db: ChatDb;
	preview: unknown;
	writeId: string;
}) => {
	const updated = await db
		.update(chatApprovalWrites)
		.set({ preview, updated_at: Date.now() })
		.where(
			and(
				eq(chatApprovalWrites.id, writeId),
				eq(chatApprovalWrites.status, "pending"),
				parentIsPending(db, approvalId),
			),
		)
		.returning({ id: chatApprovalWrites.id });
	return updated.length > 0;
};

const setStepStatus = async ({
	db,
	result,
	status,
	writeId,
}: {
	db: ChatDb;
	result?: unknown;
	status: ChatApprovalWriteStatus;
	writeId: string;
}) => {
	await db
		.update(chatApprovalWrites)
		.set({ result, status, updated_at: Date.now() })
		.where(eq(chatApprovalWrites.id, writeId));
};

/** Settled writes parked by the given eve session (root or child), newest first. */
const listSettledForSession = async ({
	db,
	sessionId,
	since,
	toolName,
}: {
	db: ChatDb;
	sessionId: string;
	since: number;
	toolName: string;
}): Promise<ChatApprovalWrite[]> => {
	const rows = await db
		.select({ write: chatApprovalWrites })
		.from(chatApprovalWrites)
		.innerJoin(
			chatApprovals,
			eq(chatApprovalWrites.approval_id, chatApprovals.id),
		)
		.where(
			and(
				eq(chatApprovalWrites.tool_name, normalizeToolName(toolName)),
				inArray(chatApprovalWrites.status, ["applied", "failed", "skipped"]),
				gt(chatApprovalWrites.updated_at, since),
				or(
					eq(chatApprovals.run_id, sessionId),
					sql`${sessionId} = ANY(${chatApprovals.child_session_ids})`,
				),
			),
		)
		.orderBy(desc(chatApprovalWrites.updated_at));
	return rows.map((row) => row.write);
};

export const chatApprovalWritesRepo = {
	insert: insertSteps,
	list: listSteps,
	listSettledForSession,
	setPreview: setStepPreview,
	setStatus: setStepStatus,
} as const;
