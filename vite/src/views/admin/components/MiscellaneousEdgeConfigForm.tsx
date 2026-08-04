import { Badge, Button, DialogFooter, Input, Separator } from "@autumn/ui";
import Editor from "@monaco-editor/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { MiscellaneousEdgeConfigSwitch } from "./MiscellaneousEdgeConfigSwitch";
import {
	buildMiscellaneousJsonText,
	getStatusMessage,
	MISCELLANEOUS_EDGE_CONFIG_QUERY_KEY,
	type MiscellaneousEdgeConfig,
} from "./miscellaneousEdgeConfigTypes";

export const MiscellaneousEdgeConfigForm = ({
	config: loadedConfig,
	onClose,
}: {
	config: MiscellaneousEdgeConfig;
	onClose: () => void;
}) => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const [config, setConfig] = useState<MiscellaneousEdgeConfig>(loadedConfig);
	const [jsonText, setJsonText] = useState(() =>
		buildMiscellaneousJsonText({ config: loadedConfig }),
	);
	const [jsonError, setJsonError] = useState<string | null>(null);
	const [syncSource, setSyncSource] = useState<"form" | "json">("form");
	const [newEntry, setNewEntry] = useState("");

	const mutation = useMutation({
		mutationFn: async (payload: unknown) => {
			await axiosInstance.put("/admin/miscellaneous-edge-config", payload);
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: MISCELLANEOUS_EDGE_CONFIG_QUERY_KEY,
			});
			toast.success("Miscellaneous edge config saved");
			onClose();
		},
		onError: (error) => {
			toast.error(
				getBackendErr(error, "Failed to save miscellaneous edge config"),
			);
		},
	});

	// Mirrors form edits into the JSON buffer; the buffer is what gets saved.
	useEffect(() => {
		if (syncSource !== "form") return;
		setJsonText(buildMiscellaneousJsonText({ config }));
		setJsonError(null);
	}, [config, syncSource]);

	const handleJsonChange = (value: string | undefined) => {
		const text = value ?? "";
		setJsonText(text);
		setSyncSource("json");
		try {
			const parsed = JSON.parse(text) as Partial<MiscellaneousEdgeConfig>;
			setConfig((prev) => ({
				...prev,
				newFlatCusModel: parsed.newFlatCusModel ?? prev.newFlatCusModel,
				syncCoalesce: parsed.syncCoalesce ?? prev.syncCoalesce,
				subjectLookupDbOnly:
					parsed.subjectLookupDbOnly ?? prev.subjectLookupDbOnly,
				idempotencyDynamoRead:
					parsed.idempotencyDynamoRead ?? prev.idempotencyDynamoRead,
			}));
			setJsonError(null);
		} catch {
			setJsonError("Invalid JSON");
		}
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

	const addEntry = () => {
		const entry = newEntry.trim();
		if (!entry) return;
		if (config.newFlatCusModel.includes(entry)) {
			toast.error("Entry already exists");
			return;
		}

		setSyncSource("form");
		setConfig((prev) => ({
			...prev,
			newFlatCusModel: [...prev.newFlatCusModel, entry],
		}));
		setNewEntry("");
	};

	const removeEntry = (entry: string) => {
		setSyncSource("form");
		setConfig((prev) => ({
			...prev,
			newFlatCusModel: prev.newFlatCusModel.filter((e) => e !== entry),
		}));
	};

	return (
		<>
			<div className="grid grid-cols-[300px_1fr] gap-6">
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-1">
						<div className="text-xs font-medium text-tertiary-foreground uppercase tracking-wide">
							New customer model rollout
						</div>
						<div className="text-pretty text-xs text-tertiary-foreground">
							Listed customers read through the new query path instead of the
							old one.
						</div>
					</div>
					<div className="rounded-lg border border-border p-3 flex flex-col gap-2">
						{config.newFlatCusModel.length === 0 && (
							<div className="text-pretty text-xs text-tertiary-foreground italic">
								No customers opted in — everyone uses the old path.
							</div>
						)}
						{config.newFlatCusModel.map((entry) => (
							<div
								key={entry}
								className="flex items-center justify-between gap-2"
							>
								<div className="min-w-0 flex-1">
									<div className="text-xs font-mono text-foreground truncate">
										{entry}
									</div>
								</div>
								<Button
									variant="secondary"
									size="sm"
									onClick={() => removeEntry(entry)}
								>
									Remove
								</Button>
							</div>
						))}
						<div className="flex flex-col gap-2 pt-2 border-t border-border">
							<Input
								type="text"
								placeholder="orgId:env:customerId"
								value={newEntry}
								onChange={(e) => setNewEntry(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										addEntry();
									}
								}}
								className="font-mono"
							/>
							<Button
								variant="secondary"
								size="sm"
								onClick={addEntry}
								disabled={!newEntry.trim()}
							>
								Add
							</Button>
						</div>
					</div>

					<div className="flex flex-col gap-1">
						<div className="text-xs font-medium text-tertiary-foreground uppercase tracking-wide">
							Global switches
						</div>
					</div>
					<div className="rounded-lg border border-border divide-y divide-border">
						<MiscellaneousEdgeConfigSwitch
							title="Sync coalescing"
							ariaLabel="Enable sync coalescing"
							checked={config.syncCoalesce}
							onCheckedChange={(syncCoalesce) => {
								setSyncSource("form");
								setConfig((prev) => ({ ...prev, syncCoalesce }));
							}}
						/>

						<MiscellaneousEdgeConfigSwitch
							title="Subject lookups bypass Redis"
							ariaLabel="Enable db-only subject lookups"
							checked={config.subjectLookupDbOnly}
							onCheckedChange={(subjectLookupDbOnly) => {
								setSyncSource("form");
								setConfig((prev) => ({ ...prev, subjectLookupDbOnly }));
							}}
						/>

						<MiscellaneousEdgeConfigSwitch
							title="Idempotency: DynamoDB authority"
							hint="Flip 24h+ after deploy"
							ariaLabel="Enable idempotency DynamoDB reads"
							checked={config.idempotencyDynamoRead}
							onCheckedChange={(idempotencyDynamoRead) => {
								setSyncSource("form");
								setConfig((prev) => ({ ...prev, idempotencyDynamoRead }));
							}}
						/>
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
						<p className="text-pretty">{getStatusMessage({ config })}</p>
					</div>
				</div>

				<div className="flex flex-col gap-2">
					<div className="flex flex-col gap-1">
						<div className="text-xs font-medium text-tertiary-foreground uppercase tracking-wide">
							Raw JSON
						</div>
						<div className="text-pretty text-xs text-tertiary-foreground">
							Edits here and in the controls stay in sync. This is what gets
							saved.
						</div>
					</div>
					<div className="rounded-md border border-border overflow-hidden h-[300px]">
						<Editor
							height="100%"
							language="json"
							value={jsonText}
							onChange={handleJsonChange}
							options={{
								minimap: { enabled: false },
								scrollBeyondLastLine: false,
								fontSize: 13,
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
