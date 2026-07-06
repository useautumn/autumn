import { cancelChatApproval } from "./cancelChatApproval.js";
import { claimChatApproval } from "./claimChatApproval.js";
import { finalizeChatApproval } from "./finalizeChatApproval.js";
import { getChatApproval } from "./getChatApproval.js";
import { insertChatApproval } from "./insertChatApproval.js";
import { listChatApprovalsForChannel } from "./listChatApprovalsForChannel.js";
import { listPendingChatApprovalsForOrg } from "./listPendingChatApprovalsForOrg.js";
import { listPendingChatApprovalsForRun } from "./listPendingChatApprovalsForRun.js";
import { releaseChatApproval } from "./releaseChatApproval.js";
import { setChatApprovalMessageTs } from "./setChatApprovalMessageTs.js";

export const chatApprovalRepo = {
	cancel: cancelChatApproval,
	claim: claimChatApproval,
	finalize: finalizeChatApproval,
	get: getChatApproval,
	insert: insertChatApproval,
	listForChannel: listChatApprovalsForChannel,
	listPendingForOrg: listPendingChatApprovalsForOrg,
	listPendingForRun: listPendingChatApprovalsForRun,
	release: releaseChatApproval,
	setMessageTs: setChatApprovalMessageTs,
} as const;
