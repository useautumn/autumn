import { resolveApproval } from "../src/internal/approvals/actions/resolveApproval.js";
import { chatApprovalRepo } from "../src/internal/approvals/repos/chatApprovalRepo.js";
import { chatApprovalWritesRepo } from "../src/internal/approvals/repos/chatApprovalWritesRepo.js";
import { db } from "../src/lib/db.js";

const approvalId = process.argv[2];
const providerUserId = process.argv[3] ?? "validate-script";
if (!approvalId)
	throw new Error("usage: validateDirectApprove.ts <approvalId>");

const claimed = await chatApprovalRepo.claim({
	approvalId,
	db,
	providerUserId,
});
if (!claimed) throw new Error("claim failed (not pending?)");

const started = Date.now();
const result = await resolveApproval({ approval: claimed, providerUserId });
console.log(`resolve returned in ${Date.now() - started}ms`);
console.log(JSON.stringify({ ...result, narration: undefined }, null, 1));
if ("narration" in result && result.narration) {
	const narrated = await result.narration;
	console.log("narration:", JSON.stringify(narrated)?.slice(0, 400));
}

const writes = await chatApprovalWritesRepo.list({ approvalId, db });
console.log(
	"write rows:",
	writes.map((write) => `${write.tool_name}=${write.status}`).join(", "),
);
process.exit(0);
