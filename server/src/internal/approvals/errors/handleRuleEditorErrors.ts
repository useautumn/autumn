import { ErrCode, RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isApprovalRuleEditor } from "../utils/isApprovalRuleEditor.js";

/** Returns who the write is recorded as: the user, or the secret key when it has no user. */
export const handleRuleEditorErrors = ({ ctx }: { ctx: AutumnContext }) => {
	const editorId = ctx.userId ?? ctx.apiKeyId;
	if (isApprovalRuleEditor({ ctx }) && editorId) return editorId;

	throw new RecaseError({
		message:
			"Only owners, admins and secret keys with every scope can change approval rules.",
		code: ErrCode.ApprovalRuleEditorRequired,
		statusCode: 403,
	});
};
