import {
	Alert,
	AlertDescription,
	Badge,
	Button,
	DialogFooter,
	Input,
	Separator,
	Switch,
} from "@autumn/ui";
import { useStore } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useAppForm } from "@/hooks/form/form";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import {
	METERING_SHADOW_QUERY_KEY,
	type MeteringShadowConfig,
} from "./meteringShadowConfigTypes";

type MeteringShadowPayload = Pick<MeteringShadowConfig, "enabled" | "orgs">;

export const MeteringShadowForm = ({
	config,
	onClose,
}: {
	config: MeteringShadowConfig;
	onClose: () => void;
}) => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const [newOrgId, setNewOrgId] = useState("");

	const mutation = useMutation({
		mutationFn: async (payload: MeteringShadowPayload) => {
			await axiosInstance.put("/admin/metering-shadow-config", payload);
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: METERING_SHADOW_QUERY_KEY,
			});
			toast.success("Metering shadow config saved");
			onClose();
		},
		onError: (error) => {
			toast.error(
				getBackendErr(error, "Failed to save metering shadow config"),
			);
		},
	});

	const form = useAppForm({
		defaultValues: {
			enabled: config.enabled,
			orgs: config.orgs,
		} satisfies MeteringShadowPayload,
		onSubmit: async ({ value }) => {
			await mutation.mutateAsync(value);
		},
	});

	const enabled = useStore(form.store, (state) => state.values.enabled);
	const orgs = useStore(form.store, (state) => state.values.orgs);
	const isDirty = useStore(form.store, (state) => state.isDirty);

	const addOrg = () => {
		const orgId = newOrgId.trim();
		if (!orgId) return;
		if (orgs.includes(orgId)) {
			toast.error("Org already in list");
			return;
		}

		form.pushFieldValue("orgs", orgId);
		setNewOrgId("");
	};

	const statusMessage =
		config.configConfigured === false
			? "Metering shadow config is missing in S3, so the mirror stays off."
			: (config.error ??
				"Saved changes reach all servers within 10 seconds. Kafka must also be wired up (KAFKA_BOOTSTRAP) for the mirror to run.");

	return (
		<>
			<div className="flex flex-col gap-6">
				<div className="flex items-center justify-between gap-6">
					<div className="flex flex-col gap-1">
						<div className="text-sm font-medium text-foreground">
							Shadow tap enabled
						</div>
						<div className="text-pretty text-xs text-tertiary-foreground">
							Mirrors committed balance deductions onto the metering events
							topic. Track responses are never blocked by the mirror.
						</div>
					</div>
					<form.AppField name="enabled">
						{(field) => (
							<Switch
								aria-label="Enable the metering shadow tap"
								checked={field.state.value}
								onCheckedChange={field.handleChange}
							/>
						)}
					</form.AppField>
				</div>

				{!enabled && (
					<Alert>
						<AlertDescription className="text-pretty">
							No deductions are mirrored, and no Kafka producer is opened.
						</AlertDescription>
					</Alert>
				)}

				<div className="flex flex-col gap-3">
					<div className="flex flex-col gap-1">
						<div className="text-xs font-medium uppercase text-tertiary-foreground">
							Mirrored orgs
						</div>
						<div className="text-pretty text-xs text-tertiary-foreground">
							Listed orgs are mirrored. Leave the list empty (or add
							<span className="font-mono"> * </span>) to mirror every org.
						</div>
					</div>

					<div className="rounded-lg border border-border p-3">
						<div className="mb-3 flex gap-2">
							<Input
								placeholder="Org ID"
								aria-label="Org ID"
								value={newOrgId}
								onChange={(event) => setNewOrgId(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										event.preventDefault();
										addOrg();
									}
								}}
							/>
							<Button
								variant="secondary"
								size="sm"
								onClick={addOrg}
								disabled={!newOrgId.trim()}
							>
								Add
							</Button>
						</div>

						<form.AppField name="orgs" mode="array">
							{(field) => (
								<div className="flex flex-col gap-2 border-t border-border pt-3">
									{field.state.value.length === 0 && (
										<div className="text-pretty text-xs italic text-tertiary-foreground">
											No orgs listed — every org is mirrored while the tap is
											on.
										</div>
									)}
									{field.state.value.map((orgId, index) => (
										<div
											key={orgId}
											className="flex items-center justify-between gap-3 rounded-lg border border-border p-2"
										>
											<div className="truncate font-mono text-xs text-foreground">
												{orgId}
											</div>
											<Button
												variant="secondary"
												size="sm"
												onClick={() => field.removeValue(index)}
											>
												Remove
											</Button>
										</div>
									))}
								</div>
							)}
						</form.AppField>
					</div>
				</div>

				<div className="flex flex-col gap-3 text-xs text-tertiary-foreground">
					<Separator />
					<div className="flex flex-wrap items-center gap-2">
						<Badge variant="muted">
							{config.configHealthy ? "Config healthy" : "Config unavailable"}
						</Badge>
						{config.lastSuccessAt && (
							<span className="tabular-nums">
								Last refresh: {new Date(config.lastSuccessAt).toLocaleString()}
							</span>
						)}
					</div>
					<p className="text-pretty">{statusMessage}</p>
				</div>
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
};
