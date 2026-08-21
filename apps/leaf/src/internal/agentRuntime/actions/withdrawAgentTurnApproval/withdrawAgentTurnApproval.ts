import { db } from "../../../../lib/db.js";
import { adoptPostedEveSession } from "../../eve/adoptPostedSession.js";
import { postEveInputResponse } from "../../eve/client.js";
import { siblingRequestIdsFromToolArgs } from "../../eve/parkedInput.js";
import { getEveSessionBySessionId } from "../../eve/repo.js";
import type { EveAuthContext } from "../../eve/types.js";
import { QUEUED_TURN_WITHDRAWAL_NOTE } from "../submitAgentInput/agentInputNotes.js";
import { drainParkedAgentTurn } from "../submitAgentInput/drainParkedAgentTurn.js";

export const withdrawAgentTurnApproval = async ({
	auth,
	orgId,
	sessionId,
	approval,
}: {
	auth: EveAuthContext;
	orgId: string;
	sessionId: string;
	approval: { toolArgs: Record<string, unknown>; toolCallId?: string };
}) => {
	if (!approval.toolCallId) return false;
	const session = await getEveSessionBySessionId({
		db,
		orgId,
		sessionId,
	});
	if (!session) return false;
	const denyOptionId =
		typeof approval.toolArgs._eveDenyOptionId === "string"
			? approval.toolArgs._eveDenyOptionId
			: "deny";
	const posted = await postEveInputResponse({
		auth,
		note: QUEUED_TURN_WITHDRAWAL_NOTE,
		optionId: denyOptionId,
		requestId: approval.toolCallId,
		session,
		siblingRequestIds: siblingRequestIdsFromToolArgs(approval.toolArgs),
	});
	adoptPostedEveSession({ posted, session, status: "running" });
	await drainParkedAgentTurn({ auth, orgId, session });
	return true;
};
