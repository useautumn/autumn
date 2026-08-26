import {
	Alert,
	AlertDescription,
	Badge,
	Button,
	DialogFooter,
	Input,
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Separator,
} from "@autumn/ui";
import { useStore } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useAppForm } from "@/hooks/form/form";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import {
	METERING_ROUTING_MODE_OPTIONS,
	METERING_ROUTING_ORG_MODE_OPTIONS,
	METERING_ROUTING_QUERY_KEY,
	type MeteringRoutingConfig,
	type MeteringRoutingMode,
	type MeteringRoutingOrgMode,
	type MeteringRoutingPayload,
} from "./meteringRoutingConfigTypes";

const DEFAULT_NEW_ORG_MODE: MeteringRoutingOrgMode = "serve_reads";

export const MeteringRoutingForm = ({
	config,
	onClose,
}: {
	config: MeteringRoutingConfig;
	onClose: () => void;
}) => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const [newOrgId, setNewOrgId] = useState("");

	const mutation = useMutation({
		mutationFn: async (payload: MeteringRoutingPayload) => {
			await axiosInstance.put("/admin/metering-routing-config", payload);
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: METERING_ROUTING_QUERY_KEY,
			});
			toast.success("Metering routing config saved");
			onClose();
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to save metering routing"));
		},
	});

	const form = useAppForm({
		defaultValues: {
			orgModes: config.orgModes,
			defaultMode: config.defaultMode,
		} satisfies MeteringRoutingPayload,
		onSubmit: async ({ value }) => {
			await mutation.mutateAsync(value);
		},
	});

	const orgModes = useStore(form.store, (state) => state.values.orgModes);
	const isDirty = useStore(form.store, (state) => state.isDirty);
	const orgEntries = Object.entries(orgModes);

	const setOrgModes = (next: Record<string, MeteringRoutingOrgMode>) => {
		form.setFieldValue("orgModes", next);
	};

	const addOrg = () => {
		const orgId = newOrgId.trim();
		if (!orgId) return;
		if (orgId in orgModes) {
			toast.error("Org already has a mode");
			return;
		}

		setOrgModes({ ...orgModes, [orgId]: DEFAULT_NEW_ORG_MODE });
		setNewOrgId("");
	};

	const removeOrg = (orgId: string) => {
		const { [orgId]: _removed, ...rest } = orgModes;
		setOrgModes(rest);
	};

	const statusMessage = config.configConfigured
		? (config.error ??
			"Saved changes reach all servers within 10 seconds. Every fallback to Redis is logged.")
		: "Metering routing config is missing in S3, so every org stays off.";

	return (
		<>
			<div className="flex flex-col gap-6">
				{!config.workerUrlConfigured && (
					<Alert>
						<AlertDescription className="text-pretty">
							This deploy has no{" "}
							<span className="font-mono">METERING_WORKER_URL</span>, so nothing
							below takes effect — check and track stay on Redis whatever the
							modes say.
						</AlertDescription>
					</Alert>
				)}

				<form.AppField name="defaultMode">
					{(field) => (
						<div className="flex flex-col gap-2">
							<div className="text-xs font-medium uppercase text-tertiary-foreground">
								Default mode
							</div>
							<div className="text-pretty text-xs text-tertiary-foreground">
								Applies to every org without its own entry below.
							</div>
							<Select
								value={field.state.value}
								onValueChange={(value) =>
									field.handleChange(value as MeteringRoutingMode)
								}
								items={METERING_ROUTING_MODE_OPTIONS.map((option) => ({
									value: option.value,
									label: option.label,
								}))}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										{METERING_ROUTING_MODE_OPTIONS.map((option) => (
											<SelectItem key={option.value} value={option.value}>
												<div className="flex flex-col">
													<span className="text-sm text-foreground">
														{option.label}
													</span>
													<span className="text-xs text-tertiary-foreground">
														{option.description}
													</span>
												</div>
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</div>
					)}
				</form.AppField>

				<div className="flex flex-col gap-3">
					<div className="flex flex-col gap-1">
						<div className="text-xs font-medium uppercase text-tertiary-foreground">
							Per-org modes
						</div>
						<div className="text-pretty text-xs text-tertiary-foreground">
							Remove an org to send it back to the default mode.
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

						<div className="flex flex-col gap-2 border-t border-border pt-3">
							{orgEntries.length === 0 && (
								<div className="text-pretty text-xs italic text-tertiary-foreground">
									No per-org overrides — every org follows the default mode.
								</div>
							)}
							{orgEntries.map(([orgId, mode]) => (
								<div
									key={orgId}
									className="flex items-center justify-between gap-3 rounded-lg border border-border p-2"
								>
									<div className="truncate font-mono text-xs text-foreground">
										{orgId}
									</div>
									<div className="flex shrink-0 items-center gap-2">
										<Select
											value={mode}
											onValueChange={(value) =>
												setOrgModes({
													...orgModes,
													[orgId]: value as MeteringRoutingOrgMode,
												})
											}
											items={METERING_ROUTING_ORG_MODE_OPTIONS.map(
												(option) => ({
													value: option.value,
													label: option.label,
												}),
											)}
										>
											<SelectTrigger
												aria-label={`Routing mode for ${orgId}`}
												className="w-40"
											>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectGroup>
													{METERING_ROUTING_ORG_MODE_OPTIONS.map((option) => (
														<SelectItem key={option.value} value={option.value}>
															{option.label}
														</SelectItem>
													))}
												</SelectGroup>
											</SelectContent>
										</Select>
										<Button
											variant="secondary"
											size="sm"
											onClick={() => removeOrg(orgId)}
										>
											Remove
										</Button>
									</div>
								</div>
							))}
						</div>
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
