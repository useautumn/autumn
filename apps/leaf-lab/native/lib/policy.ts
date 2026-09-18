import type { ApprovalPolicy, ApprovalStatus } from "eve/tools/approval";
import type { NativeCall } from "./protocol.js";

export const nativeApprovalPolicy =
	({
		name,
		gated,
		request,
	}: {
		name: string;
		gated: boolean;
		request: <T>(path: string, body: NativeCall) => Promise<T>;
	}): ApprovalPolicy<Record<string, unknown>> =>
	async ({ session, callId, toolInput }): Promise<ApprovalStatus> => {
		if (!gated) return "not-applicable";
		try {
			await request("/validate", {
				sessionId: session.id,
				callId,
				name,
				args: { ...toolInput },
			});
			return "user-approval";
		} catch (error) {
			return {
				type: "denied",
				reason:
					error instanceof Error ? error.message : "Proposal validation failed",
			};
		}
	};
