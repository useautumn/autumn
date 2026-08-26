import type { ChatApproval, ChatApprovalWrite } from "@autumn/shared";
import { db } from "../../../lib/db.js";
import { logger } from "../../../lib/logger.js";
import { getOrgInstallationToken } from "../../installations/actions/getOrgInstallationToken.js";
import { chatApprovalRepo } from "../repos/chatApprovalRepo.js";
import { chatApprovalWritesRepo } from "../repos/chatApprovalWritesRepo.js";
import { withWritePreviews } from "../utils/fetchApprovalPreview.js";
import { previewMoneyFactsDrifted } from "../utils/previewMoneyFacts.js";
import { writeToPreviewTool } from "../utils/toolRegistry.js";

const DRIFT_MESSAGE =
	"Prices changed since this card was shown — nothing was applied. Review the updated preview and approve again.";

/** Re-previews every write and compares money facts against what the card
 * showed. Fail closed: an unfetchable preview counts as drifted. */
const detectPreviewDrift = async ({
	env,
	writes,
	token,
}: {
	env: ChatApproval["env"];
	writes: ReadonlyArray<ChatApprovalWrite>;
	token: string;
}) => {
	const checkable = writes.filter(
		(write) => write.preview && writeToPreviewTool(write.tool_name),
	);
	if (!checkable.length) return { drifted: false } as const;
	const fresh = await withWritePreviews({
		env,
		getToken: async () => token,
		logger,
		writes: checkable.map((write) => ({
			input: write.tool_args,
			requestId: write.request_id ?? "",
			toolName: write.tool_name,
		})),
	});
	const reason = checkable
		.map((write, index) => {
			const verdict = previewMoneyFactsDrifted({
				current: fresh[index]?.preview,
				stored: write.preview,
			});
			return verdict.drifted ? verdict.reason : undefined;
		})
		.find(Boolean);
	if (!reason) return { drifted: false } as const;
	return {
		drifted: true,
		reason,
		refresh: async () => {
			await Promise.all(
				checkable.map((write, index) =>
					setWritePreviewEverywhere({
						preview: fresh[index]?.preview,
						write,
					}),
				),
			);
		},
	} as const;
};

/** The primary write is mirrored on the parent row for card rendering, so a
 * refreshed preview must land on both copies or they drift apart. */
const setWritePreviewEverywhere = async ({
	preview,
	write,
}: {
	preview: unknown;
	write: ChatApprovalWrite;
}) => {
	await chatApprovalWritesRepo.setPreview({
		approvalId: write.approval_id,
		db,
		preview,
		writeId: write.id,
	});
	if (write.position === 0) {
		await chatApprovalRepo.setPreview({
			approvalId: write.approval_id,
			db,
			preview,
		});
	}
};

/** Pre-resume money guard: a drifted card is released back to pending with
 * fresh previews instead of resuming — nothing executes. */
export const guardApprovalDrift = async ({
	approval,
	providerUserId,
}: {
	approval: ChatApproval;
	providerUserId: string;
}): Promise<{ drifted: true; message: string } | undefined> => {
	const writes = await chatApprovalWritesRepo.list({
		approvalId: approval.id,
		db,
	});
	const checkable = writes.some(
		(write) => write.preview && writeToPreviewTool(write.tool_name),
	);
	if (!checkable) return undefined;

	const { accessToken } = await getOrgInstallationToken({
		env: approval.env,
		orgId: approval.org_id,
		provider: approval.provider,
		workspaceId: approval.workspace_id,
	});
	const drift = await detectPreviewDrift({
		env: approval.env,
		writes,
		token: accessToken,
	});
	if (!drift.drifted) return undefined;

	// Release first: the preview writers are pending-guarded, so the fresh
	// previews can only land once the row is back in pending.
	await chatApprovalRepo.release({
		approvalId: approval.id,
		db,
		providerUserId,
	});
	await drift.refresh();
	logger.info("Approval drifted; card refreshed instead of executing", {
		event: "leaf.approval_drift_refreshed",
		approval_id: approval.id,
		data: { reason: drift.reason },
	});
	return { drifted: true, message: DRIFT_MESSAGE };
};
