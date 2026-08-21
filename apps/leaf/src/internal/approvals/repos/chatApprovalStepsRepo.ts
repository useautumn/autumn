import crypto from "node:crypto";
import {
	type ChatApprovalStep,
	type ChatApprovalStepStatus,
	chatApprovalSteps,
	chatApprovals,
} from "@autumn/shared";
import { and, asc, eq, exists } from "drizzle-orm";
import type { ChatDb } from "../../../lib/db.js";
import { normalizeToolName } from "../../agentRuntime/tools/toolPolicy.js";

export type InsertApprovalStep = {
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
	steps: ReadonlyArray<InsertApprovalStep>;
}) => {
	if (!steps.length) return;
	await db.insert(chatApprovalSteps).values(
		steps.map((step, position) => ({
			id: `chat_stp_${crypto.randomUUID().replace(/-/g, "")}`,
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
}): Promise<ChatApprovalStep[]> =>
	db
		.select()
		.from(chatApprovalSteps)
		.where(eq(chatApprovalSteps.approval_id, approvalId))
		.orderBy(asc(chatApprovalSteps.position));

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
	stepId,
}: {
	approvalId: string;
	db: ChatDb;
	preview: unknown;
	stepId: string;
}) => {
	const updated = await db
		.update(chatApprovalSteps)
		.set({ preview, updated_at: Date.now() })
		.where(
			and(
				eq(chatApprovalSteps.id, stepId),
				eq(chatApprovalSteps.status, "pending"),
				parentIsPending(db, approvalId),
			),
		)
		.returning({ id: chatApprovalSteps.id });
	return updated.length > 0;
};

const setStepStatus = async ({
	db,
	result,
	status,
	stepId,
}: {
	db: ChatDb;
	result?: unknown;
	status: ChatApprovalStepStatus;
	stepId: string;
}) => {
	await db
		.update(chatApprovalSteps)
		.set({ result, status, updated_at: Date.now() })
		.where(eq(chatApprovalSteps.id, stepId));
};

export const chatApprovalStepsRepo = {
	insert: insertSteps,
	list: listSteps,
	setPreview: setStepPreview,
	setStatus: setStepStatus,
} as const;
