import {
	Alert,
	AlertDescription,
	AlertTitle,
	Button,
	DialogFooter,
} from "@autumn/ui";
import { useStore } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAppForm } from "@/hooks/form/form";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import {
	AGENT_PROVISION_RATE_LIMIT_QUERY_KEY,
	type AgentProvisionRateLimitConfig,
	type AgentProvisionRateLimitFormValues,
} from "./agentProvisionRateLimitConfigTypes";

const RATE_LIMIT_FIELDS = [
	{
		name: "globalRequestsPerHour",
		label: "Global requests per hour",
		description: "Maximum org provisions across all clients.",
	},
	{
		name: "requestsPerIpPerHour",
		label: "Requests per IP per hour",
		description: "Maximum org provisions from one client IP.",
	},
] as const;

export function AgentProvisionRateLimitConfigForm({
	config,
	onClose,
}: {
	config: AgentProvisionRateLimitConfig;
	onClose: () => void;
}) {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const mutation = useMutation({
		mutationFn: async (nextConfig: AgentProvisionRateLimitFormValues) => {
			await axiosInstance.put(
				"/admin/agent-provision-rate-limit-config",
				nextConfig,
			);
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: AGENT_PROVISION_RATE_LIMIT_QUERY_KEY,
			});
			toast.success("Agent provision rate limit saved");
			onClose();
		},
		onError: (error) => {
			toast.error(
				getBackendErr(error, "Failed to save agent provision rate limit"),
			);
		},
	});
	const form = useAppForm({
		defaultValues: {
			globalRequestsPerHour: config.globalRequestsPerHour as number | null,
			requestsPerIpPerHour: config.requestsPerIpPerHour as number | null,
		},
		onSubmit: async ({ value }) => {
			if (
				value.globalRequestsPerHour === null ||
				value.requestsPerIpPerHour === null
			) {
				return;
			}

			await mutation.mutateAsync({
				globalRequestsPerHour: value.globalRequestsPerHour,
				requestsPerIpPerHour: value.requestsPerIpPerHour,
			});
		},
	});
	const isDirty = useStore(form.store, (state) => state.isDirty);

	return (
		<>
			<div className="flex flex-col gap-6">
				<div className="grid gap-5 sm:grid-cols-2">
					{RATE_LIMIT_FIELDS.map(({ name, label, description }) => (
						<form.AppField key={name} name={name}>
							{(field) => (
								<field.NumberField
									label={label}
									description={description}
									min={0}
									max={1_000_000}
									inputClassName="tabular-nums"
								/>
							)}
						</form.AppField>
					))}
				</div>

				<Alert variant={config.configHealthy ? "default" : "destructive"}>
					<AlertTitle>
						{config.configHealthy
							? "Edge config healthy"
							: "Edge config unavailable"}
					</AlertTitle>
					<AlertDescription className="flex flex-col gap-1">
						<span>
							{config.configConfigured ? "Loaded from S3." : "Using defaults."}
							{config.lastSuccessAt && (
								<span className="ml-1 tabular-nums">
									Last refresh:{" "}
									{new Date(config.lastSuccessAt).toLocaleString()}
								</span>
							)}
						</span>
						<span className="text-pretty">
							{config.error ||
								"Changes propagate to all servers within 10 seconds. A value of zero blocks provisioning at that scope."}
						</span>
					</AlertDescription>
				</Alert>
			</div>

			<DialogFooter className="flex-wrap pt-2">
				{mutation.error && (
					<span role="alert" className="mr-auto text-xs text-destructive">
						{getBackendErr(mutation.error, "Failed to save config")}
					</span>
				)}
				<Button variant="secondary" onClick={onClose}>
					Cancel
				</Button>
				<Button
					variant="primary"
					onClick={() => form.handleSubmit()}
					isLoading={mutation.isPending}
					disabled={!isDirty || mutation.isPending}
				>
					Save
				</Button>
			</DialogFooter>
		</>
	);
}
