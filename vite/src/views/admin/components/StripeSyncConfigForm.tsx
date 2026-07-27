import { Badge, Button, DialogFooter, Input, Separator } from "@autumn/ui";
import Editor from "@monaco-editor/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import {
	buildStripeSyncJsonText,
	getStripeSyncStatusMessage,
	STRIPE_SYNC_QUERY_KEY,
	type StripeSyncConfig,
} from "./stripeSyncConfigTypes";

export const StripeSyncConfigForm = ({
	config: loadedConfig,
	onClose,
}: {
	config: StripeSyncConfig;
	onClose: () => void;
}) => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const [config, setConfig] = useState<StripeSyncConfig>(loadedConfig);
	const [jsonText, setJsonText] = useState(() =>
		buildStripeSyncJsonText({ config: loadedConfig }),
	);
	const [jsonError, setJsonError] = useState<string | null>(null);
	const [syncSource, setSyncSource] = useState<"form" | "json">("form");
	const [newOrgId, setNewOrgId] = useState("");

	const mutation = useMutation({
		mutationFn: async (payload: unknown) => {
			await axiosInstance.put("/admin/stripe-sync-config", payload);
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: STRIPE_SYNC_QUERY_KEY });
			toast.success("Stripe sync config saved");
			onClose();
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to save stripe sync config"));
		},
	});

	// Mirrors form edits into the JSON buffer; the buffer is what gets saved.
	useEffect(() => {
		if (syncSource !== "form") return;
		setJsonText(buildStripeSyncJsonText({ config }));
		setJsonError(null);
	}, [config, syncSource]);

	const sortedOrgIds = useMemo(
		() => [...config.enabledOrgIds].sort(),
		[config.enabledOrgIds],
	);

	const handleJsonChange = (value: string | undefined) => {
		const text = value ?? "";
		setJsonText(text);
		setSyncSource("json");

		try {
			const parsed = JSON.parse(text) as { enabledOrgIds?: string[] };
			setConfig((current) => ({
				...current,
				enabledOrgIds: parsed.enabledOrgIds ?? [],
			}));
			setJsonError(null);
		} catch {
			setJsonError("Invalid JSON");
		}
	};

	const addOrg = () => {
		const orgId = newOrgId.trim();
		if (!orgId) return;
		if (config.enabledOrgIds.includes(orgId)) {
			toast.error("Org already in list");
			return;
		}

		setSyncSource("form");
		setConfig((current) => ({
			...current,
			enabledOrgIds: [...current.enabledOrgIds, orgId],
		}));
		setNewOrgId("");
	};

	const removeOrg = ({ orgId }: { orgId: string }) => {
		setSyncSource("form");
		setConfig((current) => ({
			...current,
			enabledOrgIds: current.enabledOrgIds.filter((id) => id !== orgId),
		}));
	};

	const handleSave = async () => {
		if (jsonError) {
			toast.error("Fix JSON errors before saving");
			return;
		}

		let payload: unknown;
		try {
			payload = JSON.parse(jsonText);
		} catch {
			toast.error("Invalid JSON");
			return;
		}

		await mutation.mutateAsync(payload);
	};

	return (
		<>
			<div className="grid grid-cols-[320px_1fr] gap-6">
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-1">
						<div className="text-xs font-medium uppercase tracking-wide text-tertiary-foreground">
							Enabled orgs
						</div>
						<div className="text-pretty text-xs text-tertiary-foreground">
							Listed orgs get synced. Everyone else is off.
						</div>
					</div>

					<div className="rounded-lg border border-border p-3">
						<div className="mb-3 flex gap-2">
							<Input
								placeholder="Org ID or slug"
								value={newOrgId}
								onChange={(event) => setNewOrgId(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter") addOrg();
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
							{sortedOrgIds.length === 0 && (
								<div className="text-pretty text-xs italic text-tertiary-foreground">
									No orgs enabled — sync is off everywhere.
								</div>
							)}
							{sortedOrgIds.map((orgId) => (
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
										onClick={() => removeOrg({ orgId })}
									>
										Remove
									</Button>
								</div>
							))}
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
									Last refresh:{" "}
									{new Date(config.lastSuccessAt).toLocaleString()}
								</span>
							)}
						</div>
						<p className="text-pretty">
							{getStripeSyncStatusMessage({ config })}
						</p>
					</div>
				</div>

				<div className="flex flex-col gap-2">
					<div className="flex flex-col gap-1">
						<div className="text-xs font-medium uppercase tracking-wide text-tertiary-foreground">
							Raw JSON
						</div>
						<div className="text-pretty text-xs text-tertiary-foreground">
							Edits here and in the list stay in sync. This is what gets saved.
						</div>
					</div>
					<div className="overflow-hidden rounded-md border border-border">
						<Editor
							height="420px"
							language="json"
							value={jsonText}
							onChange={handleJsonChange}
							options={{
								minimap: { enabled: false },
								scrollBeyondLastLine: false,
								fontSize: 12,
								tabSize: 2,
								wordWrap: "on",
								formatOnPaste: true,
								formatOnType: true,
							}}
							theme="vs-dark"
						/>
					</div>
					{jsonError && (
						<div role="alert" className="text-xs text-destructive">
							{jsonError}
						</div>
					)}
				</div>
			</div>

			<DialogFooter>
				<Button variant="secondary" onClick={onClose}>
					Cancel
				</Button>
				<Button
					variant="primary"
					onClick={handleSave}
					isLoading={mutation.isPending}
					disabled={!!jsonError}
				>
					Save
				</Button>
			</DialogFooter>
		</>
	);
};
