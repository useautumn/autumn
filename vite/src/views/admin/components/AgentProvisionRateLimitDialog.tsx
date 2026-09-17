import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@autumn/ui";
import { useQuery } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { AgentProvisionRateLimitConfigForm } from "./AgentProvisionRateLimitConfigForm";
import {
	AGENT_PROVISION_RATE_LIMIT_QUERY_KEY,
	type AgentProvisionRateLimitConfig,
} from "./agentProvisionRateLimitConfigTypes";
import { EdgeConfigDialogBody } from "./EdgeConfigDialogBody";

export function AgentProvisionRateLimitDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const axiosInstance = useAxiosInstance();
	const configQuery = useQuery<AgentProvisionRateLimitConfig>({
		queryKey: AGENT_PROVISION_RATE_LIMIT_QUERY_KEY,
		queryFn: async () => {
			const { data } = await axiosInstance.get<AgentProvisionRateLimitConfig>(
				"/admin/agent-provision-rate-limit-config",
			);
			return data;
		},
		enabled: open,
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-xl bg-card">
				<DialogHeader>
					<DialogTitle className="text-balance">
						Agent Provision Rate Limit
					</DialogTitle>
					<DialogDescription className="text-pretty">
						Control the global and per-IP hourly limits for agent-created
						organizations.
					</DialogDescription>
				</DialogHeader>

				<EdgeConfigDialogBody
					query={configQuery}
					errorMessage="Failed to load agent provision rate limit"
				>
					{(config) => (
						<AgentProvisionRateLimitConfigForm
							key={`${config.globalRequestsPerHour}:${config.requestsPerIpPerHour}:${config.lastSuccessAt}`}
							config={config}
							onClose={() => onOpenChange(false)}
						/>
					)}
				</EdgeConfigDialogBody>
			</DialogContent>
		</Dialog>
	);
}
