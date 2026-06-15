import { cancelChatApproval } from "./cancelChatApproval.js";
import { claimChatApproval } from "./claimChatApproval.js";
import { finalizeChatApproval } from "./finalizeChatApproval.js";
import { getChatApproval } from "./getChatApproval.js";
import { insertChatApproval } from "./insertChatApproval.js";

export const chatApprovalRepo = {
	cancel: cancelChatApproval,
	claim: claimChatApproval,
	finalize: finalizeChatApproval,
	get: getChatApproval,
	insert: insertChatApproval,
} as const;
