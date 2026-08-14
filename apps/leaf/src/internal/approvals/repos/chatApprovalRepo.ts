import { cancelChatApproval } from "./cancelChatApproval.js";
import { cancelChatApprovalGroup } from "./cancelChatApprovalGroup.js";
import { claimChatApprovalGroup } from "./claimChatApprovalGroup.js";
import { finalizeChatApprovalGroup } from "./finalizeChatApprovalGroup.js";
import { getChatApprovalGroup } from "./getChatApprovalGroup.js";
import { insertChatApprovalGroup } from "./insertChatApprovalGroup.js";
import { listChatApprovalsForChannel } from "./listChatApprovalsForChannel.js";
import { listPendingChatApprovalsForOrg } from "./listPendingChatApprovalsForOrg.js";
import { listPendingChatApprovalsForRun } from "./listPendingChatApprovalsForRun.js";
import { moveChatApprovalToRun } from "./moveChatApprovalToRun.js";
import { releaseChatApprovalGroup } from "./releaseChatApprovalGroup.js";
import { setChatApprovalMessageTs } from "./setChatApprovalMessageTs.js";

export const chatApprovalRepo = {
	cancel: cancelChatApproval,
	cancelGroup: cancelChatApprovalGroup,
	claimGroup: claimChatApprovalGroup,
	finalizeGroup: finalizeChatApprovalGroup,
	getGroup: getChatApprovalGroup,
	insertGroup: insertChatApprovalGroup,
	listForChannel: listChatApprovalsForChannel,
	listPendingForOrg: listPendingChatApprovalsForOrg,
	listPendingForRun: listPendingChatApprovalsForRun,
	moveToRun: moveChatApprovalToRun,
	releaseGroup: releaseChatApprovalGroup,
	setMessageTs: setChatApprovalMessageTs,
} as const;
