export type AgentClaimDetails = {
	status: "ready";
	organization: { id: string; name: string; slug: string };
	email: string;
	expires_at: string;
};

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const requestAgentClaim = async <T>({
	path,
	init,
}: {
	path: string;
	init?: RequestInit;
}): Promise<T> => {
	const response = await fetch(`${backendUrl}${path}`, {
		credentials: "include",
		...init,
	});
	if (!response.ok) {
		const error = new Error(`agent_claim_${response.status}`);
		(error as Error & { status?: number }).status = response.status;
		throw error;
	}
	return response.json() as Promise<T>;
};

export const getAgentClaimDetails = ({ token }: { token: string }) =>
	requestAgentClaim<AgentClaimDetails>({
		path: `/agent.preview_claim?token=${encodeURIComponent(token)}`,
	});

export const completeAgentClaim = ({ token }: { token: string }) =>
	requestAgentClaim<{
		organization_id: string;
		organization_slug: string;
		user_id: string;
		email: string;
	}>({
		path: "/agent.complete_claim",
		init: {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ token }),
		},
	});
