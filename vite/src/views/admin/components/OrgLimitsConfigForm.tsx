import { Badge, Button, DialogFooter, Input, Separator } from "@autumn/ui";
import Editor from "@monaco-editor/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import {
	buildOrgLimitsJsonText,
	DEFAULT_CUS_PRODUCT_LIMIT,
	getEntryRows,
	getStatusMessage,
	ORG_LIMITS_QUERY_KEY,
	type OrgLimitsConfig,
	type OrgLimitsEntry,
} from "./orgLimitsConfigTypes";

export const OrgLimitsConfigForm = ({
	config: loadedConfig,
	onClose,
}: {
	config: OrgLimitsConfig;
	onClose: () => void;
}) => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const [config, setConfig] = useState<OrgLimitsConfig>(loadedConfig);
	const [jsonText, setJsonText] = useState(() =>
		buildOrgLimitsJsonText({ config: loadedConfig }),
	);
	const [jsonError, setJsonError] = useState<string | null>(null);
	const [syncSource, setSyncSource] = useState<"form" | "json">("form");
	const [newOrgId, setNewOrgId] = useState("");
	const [newLimit, setNewLimit] = useState("");

	const mutation = useMutation({
		mutationFn: async (payload: unknown) => {
			await axiosInstance.put("/admin/org-limits-config", payload);
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ORG_LIMITS_QUERY_KEY });
			toast.success("Org limits config saved");
			onClose();
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to save org limits config"));
		},
	});

	// Mirrors form edits into the JSON buffer; the buffer is what gets saved.
	useEffect(() => {
		if (syncSource !== "form") return;
		setJsonText(buildOrgLimitsJsonText({ config }));
		setJsonError(null);
	}, [config, syncSource]);

	const entryRows = useMemo(() => getEntryRows({ config }), [config]);

	const handleJsonChange = (value: string | undefined) => {
		const text = value ?? "";
		setJsonText(text);
		setSyncSource("json");

		try {
			const parsed = JSON.parse(text) as {
				orgs?: Record<string, OrgLimitsEntry>;
			};
			setConfig((current) => ({
				...current,
				orgs: parsed.orgs ?? {},
			}));
			setJsonError(null);
		} catch {
			setJsonError("Invalid JSON");
		}
	};

	const addEntry = () => {
		const orgId = newOrgId.trim();
		const limit = parseInt(newLimit.trim(), 10);

		if (!orgId || Number.isNaN(limit) || limit < 1) return;

		setSyncSource("form");
		setConfig((current) => ({
			...current,
			orgs: {
				...current.orgs,
				[orgId]: { maxCusProducts: limit },
			},
		}));
		setNewOrgId("");
		setNewLimit("");
	};

	const removeEntry = ({ orgId }: { orgId: string }) => {
		setSyncSource("form");
		setConfig((current) => {
			const nextOrgs = { ...current.orgs };
			delete nextOrgs[orgId];
			return { ...current, orgs: nextOrgs };
		});
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
							Org overrides
						</div>
						<div className="text-pretty text-xs text-tertiary-foreground">
							Orgs without an override get {DEFAULT_CUS_PRODUCT_LIMIT}.
						</div>
					</div>

					<div className="rounded-lg border border-border p-3">
						<div className="mb-3 flex flex-col gap-2">
							<Input
								placeholder="Org ID or slug"
								value={newOrgId}
								onChange={(event) => setNewOrgId(event.target.value)}
							/>
							<Input
								placeholder="Max customer products (e.g. 30)"
								type="number"
								min={1}
								value={newLimit}
								onChange={(event) => setNewLimit(event.target.value)}
								className="tabular-nums"
							/>
							<Button
								variant="secondary"
								size="sm"
								onClick={addEntry}
								disabled={
									!newOrgId.trim() ||
									!newLimit.trim() ||
									Number.isNaN(parseInt(newLimit, 10)) ||
									parseInt(newLimit, 10) < 1
								}
							>
								Add org limit
							</Button>
						</div>

						<div className="flex flex-col gap-2 border-t border-border pt-3">
							{entryRows.length === 0 && (
								<div className="text-pretty text-xs italic text-tertiary-foreground">
									No overrides — every org uses {DEFAULT_CUS_PRODUCT_LIMIT}.
								</div>
							)}
							{entryRows.map((entry) => (
								<div
									key={entry.orgId}
									className="flex items-start justify-between gap-3 rounded-lg border border-border p-2"
								>
									<div className="min-w-0 flex-1">
										<div className="truncate font-mono text-xs text-foreground">
											{entry.orgId}
										</div>
										<div className="text-xs tabular-nums text-muted-foreground">
											Max customer products: {entry.maxCusProducts}
										</div>
									</div>
									<Button
										variant="secondary"
										size="sm"
										onClick={() => removeEntry({ orgId: entry.orgId })}
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
						<p className="text-pretty">{getStatusMessage({ config })}</p>
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
