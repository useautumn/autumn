import { cancelChatApproval } from "./cancelChatApproval.js";
import { cancelPendingChatApprovalsForRun } from "./cancelPendingChatApprovalsForRun.js";
import { claimChatApproval } from "./claimChatApproval.js";
import { detachPendingChatApprovalsForRun } from "./detachPendingChatApprovalsForRun.js";
import { finalizeChatApproval } from "./finalizeChatApproval.js";
import { getChatApproval } from "./getChatApproval.js";
import { insertChatApproval } from "./insertChatApproval.js";
import { listChatApprovalsForChannel } from "./listChatApprovalsForChannel.js";
import { listPendingChatApprovalsForOrg } from "./listPendingChatApprovalsForOrg.js";
import { listPendingChatApprovalsForRun } from "./listPendingChatApprovalsForRun.js";
import { moveChatApprovalsToRun } from "./moveChatApprovalToRun.js";
import { releaseChatApproval } from "./releaseChatApproval.js";
import { setChatApprovalMessageTs } from "./setChatApprovalMessageTs.js";
import { setChatApprovalPreview } from "./setChatApprovalPreview.js";

export const chatApprovalRepo = {
	cancel: cancelChatApproval,
	cancelPendingForRun: cancelPendingChatApprovalsForRun,
	claim: claimChatApproval,
	detachPendingForRun: detachPendingChatApprovalsForRun,
	finalize: finalizeChatApproval,
	get: getChatApproval,
	insert: insertChatApproval,
	listForChannel: listChatApprovalsForChannel,
	listPendingForOrg: listPendingChatApprovalsForOrg,
	listPendingForRun: listPendingChatApprovalsForRun,
	moveToRun: moveChatApprovalsToRun,
	release: releaseChatApproval,
	setMessageTs: setChatApprovalMessageTs,
	setPreview: setChatApprovalPreview,
} as const;
