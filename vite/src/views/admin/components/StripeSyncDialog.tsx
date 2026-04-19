import Editor from "@monaco-editor/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/v2/badges/Badge";
import { Button } from "@/components/v2/buttons/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { Input } from "@/components/v2/inputs/Input";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

type StripeSyncConfig = {
	enabledOrgIds: string[];
	configHealthy: boolean;
	configConfigured: boolean;
	lastSuccessAt: string | null;
	error: string | null;
};

const DEFAULT_CONFIG: StripeSyncConfig = {
	enabledOrgIds: [],
	configHealthy: false,
	configConfigured: false,
	lastSuccessAt: null,
	error: null,
};

export function StripeSyncDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const axiosInstance = useAxiosInstance();
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [config, setConfig] = useState<StripeSyncConfig>(DEFAULT_CONFIG);
	const [jsonText, setJsonText] = useState("");
	const [jsonError, setJsonError] = useState<string | null>(null);
	const [syncSource, setSyncSource] = useState<"form" | "json">("form");
	const [newOrgId, setNewOrgId] = useState("");

	useEffect(() => {
		if (!open) return;

		let cancelled = false;
		setLoading(true);

		void axiosInstance
			.get<StripeSyncConfig>("/admin/stripe-sync-config")
			.then(({ data }) => {
				if (cancelled) return;
				const merged = { ...DEFAULT_CONFIG, ...data };
				setConfig(merged);
				setJsonText(
					JSON.stringify({ enabledOrgIds: merged.enabledOrgIds }, null, 2),
				);
				setJsonError(null);
				setSyncSource("form");
			})
			.catch((error) => {
				if (!cancelled) {
					toast.error(
						getBackendErr(error, "Failed to load stripe sync config"),
					);
				}
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [axiosInstance, open]);

	useEffect(() => {
		if (syncSource !== "form") return;
		setJsonText(
			JSON.stringify({ enabledOrgIds: config.enabledOrgIds }, null, 2),
		);
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

		setSaving(true);
		try {
			await axiosInstance.put("/admin/stripe-sync-config", payload);
			toast.success("Stripe sync config saved");
			onOpenChange(false);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to save stripe sync config"));
		} finally {
			setSaving(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-5xl bg-card">
				<DialogHeader>
					<DialogTitle>Stripe Sync</DialogTitle>
					<DialogDescription>
						Manage which orgs have Stripe webhook events synced to the sync DB.
						Changes take effect within 60 seconds.
					</DialogDescription>
				</DialogHeader>

				{loading ? (
					<div className="py-8 text-center text-sm text-t3">Loading...</div>
				) : (
					<div className="grid grid-cols-[320px_1fr] gap-6">
						<div className="flex flex-col gap-4">
							<div className="text-xs font-medium uppercase tracking-wide text-t3">
								Enabled Orgs
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
									{sortedOrgIds.length === 0 ? (
										<div className="text-xs italic text-t3">
											No orgs enabled — sync is disabled for all orgs.
										</div>
									) : (
										sortedOrgIds.map((orgId) => (
											<div
												key={orgId}
												className="flex items-center justify-between gap-3 rounded-lg border border-border p-2"
											>
												<div className="truncate font-mono text-xs text-t1">
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
										))
									)}
								</div>
							</div>

							<div className="rounded-lg border border-border p-3 text-xs text-t3">
								<div className="mb-2 flex items-center gap-2">
									<Badge
										variant="muted"
										className={
											config.configHealthy
												? "border-emerald-200 bg-emerald-50 text-emerald-700"
												: "border-amber-200 bg-amber-50 text-amber-700"
										}
									>
										{config.configHealthy
											? "Config healthy"
											: "Config unavailable"}
									</Badge>
									{config.lastSuccessAt && (
										<span>
											Last refresh:{" "}
											{new Date(config.lastSuccessAt).toLocaleString()}
										</span>
									)}
								</div>
								<div>
									{config.configConfigured === false
										? "S3 stripe sync config is not configured."
										: config.error ||
											"Config updates within 60 seconds of saving."}
								</div>
							</div>
						</div>

						<div className="flex flex-col gap-2">
							<div className="text-xs font-medium uppercase tracking-wide text-t3">
								Raw JSON
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
								<div className="text-xs text-red-500">{jsonError}</div>
							)}
						</div>
					</div>
				)}

				<DialogFooter>
					<Button variant="secondary" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						variant="primary"
						onClick={handleSave}
						isLoading={saving}
						disabled={loading || !!jsonError}
					>
						Save
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
