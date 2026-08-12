import { cancelChatApproval } from "./cancelChatApproval.js";
import { claimChatApproval } from "./claimChatApproval.js";
import {
	cancelChatApprovalGroup,
	claimChatApprovalGroup,
	finalizeChatApprovalGroup,
	releaseChatApprovalGroup,
} from "./decideChatApprovalGroup.js";
import { finalizeChatApproval } from "./finalizeChatApproval.js";
import { getChatApproval } from "./getChatApproval.js";
import { getChatApprovalGroup } from "./getChatApprovalGroup.js";
import { insertChatApproval } from "./insertChatApproval.js";
import { insertChatApprovalGroup } from "./insertChatApprovalGroup.js";
import { listChatApprovalsForChannel } from "./listChatApprovalsForChannel.js";
import { listPendingChatApprovalsForOrg } from "./listPendingChatApprovalsForOrg.js";
import { listPendingChatApprovalsForRun } from "./listPendingChatApprovalsForRun.js";
import { releaseChatApproval } from "./releaseChatApproval.js";
import { setChatApprovalMessageTs } from "./setChatApprovalMessageTs.js";

export const chatApprovalRepo = {
	cancel: cancelChatApproval,
	cancelGroup: cancelChatApprovalGroup,
	claim: claimChatApproval,
	claimGroup: claimChatApprovalGroup,
	finalize: finalizeChatApproval,
	finalizeGroup: finalizeChatApprovalGroup,
	get: getChatApproval,
	getGroup: getChatApprovalGroup,
	insert: insertChatApproval,
	insertGroup: insertChatApprovalGroup,
	listForChannel: listChatApprovalsForChannel,
	listPendingForOrg: listPendingChatApprovalsForOrg,
	listPendingForRun: listPendingChatApprovalsForRun,
	release: releaseChatApproval,
	releaseGroup: releaseChatApprovalGroup,
	setMessageTs: setChatApprovalMessageTs,
} as const;
