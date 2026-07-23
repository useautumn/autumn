import { Badge, Button, DialogFooter, Input } from "@autumn/ui";
import { useStore } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAppForm } from "@/hooks/form/form";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import type { AsyncTrackConfigResponse } from "./AsyncTrackDialog";

export function AsyncTrackConfigForm({
	config,
	onSaved,
}: {
	config: AsyncTrackConfigResponse;
	onSaved: () => void;
}) {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const mutation = useMutation({
		mutationFn: async (enabledOrgIds: string[]) => {
			await axiosInstance.put("/admin/async-track-config", { enabledOrgIds });
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: ["admin-edge-config", "async-track"],
			});
			toast.success("Async Track config saved");
			onSaved();
		},
		onError: (error) =>
			toast.error(getBackendErr(error, "Failed to save Async Track config")),
	});
	const form = useAppForm({
		defaultValues: {
			enabledOrgIds: config.enabledOrgIds,
			newOrg: "",
		},
		onSubmit: async ({ value }) => {
			await mutation.mutateAsync(value.enabledOrgIds);
		},
	});
	const enabledOrgIds = useStore(
		form.store,
		(state) => state.values.enabledOrgIds,
	);
	const newOrg = useStore(form.store, (state) => state.values.newOrg);

	const addOrg = () => {
		const org = newOrg.trim();
		if (!org) return;
		if (enabledOrgIds.includes(org)) {
			toast.error("Org already in list");
			return;
		}
		form.setFieldValue("enabledOrgIds", [...enabledOrgIds, org]);
		form.setFieldValue("newOrg", "");
	};

	const removeOrg = ({ org }: { org: string }) => {
		form.setFieldValue(
			"enabledOrgIds",
			enabledOrgIds.filter((entry) => entry !== org),
		);
	};

	return (
		<>
			<div className="flex flex-col gap-4">
				<div className="flex gap-2">
					<form.AppField name="newOrg">
						{(field) => (
							<Input
								placeholder="Org ID or slug"
								value={field.state.value}
								onChange={(event) => field.handleChange(event.target.value)}
								onKeyDown={(event) => {
									if (event.key !== "Enter") return;
									event.preventDefault();
									addOrg();
								}}
							/>
						)}
					</form.AppField>
					<Button
						variant="secondary"
						onClick={addOrg}
						disabled={!newOrg.trim()}
					>
						Add
					</Button>
				</div>

				<div className="flex max-h-72 flex-col gap-2 overflow-y-auto rounded-lg border border-border p-3">
					{enabledOrgIds.length === 0 ? (
						<p className="text-pretty text-sm text-tertiary-foreground">
							No orgs configured. Add an org ID or slug above.
						</p>
					) : (
						[...enabledOrgIds].sort().map((org) => (
							<div
								key={org}
								className="flex items-center justify-between gap-3 rounded-lg border border-border p-2"
							>
								<span className="truncate font-mono text-xs text-foreground">
									{org}
								</span>
								<Button
									variant="secondary"
									size="sm"
									onClick={() => removeOrg({ org })}
								>
									Remove
								</Button>
							</div>
						))
					)}
				</div>

				<div className="flex items-center gap-2 text-xs text-tertiary-foreground">
					<Badge variant="muted">
						{config.configHealthy ? "Config healthy" : "Config unavailable"}
					</Badge>
					<span>
						{config.error ??
							(config.configConfigured
								? "Changes propagate within 30 seconds."
								: "No organizations are asynchronous by default.")}
					</span>
				</div>
			</div>

			<DialogFooter>
				<Button variant="secondary" onClick={onSaved}>
					Cancel
				</Button>
				<Button
					variant="primary"
					onClick={() => form.handleSubmit()}
					isLoading={mutation.isPending}
				>
					Save
				</Button>
			</DialogFooter>
		</>
	);
}
