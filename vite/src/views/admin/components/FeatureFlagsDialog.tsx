import {
	Badge,
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
	Separator,
	Skeleton,
	Switch,
} from "@autumn/ui";
import Editor from "@monaco-editor/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

type FeatureFlagConfig = {
	maintenanceModes: {
		analytics: {
			disableRevenueMetrics: boolean;
		};
	};
	disableOverageBillingFlags: Record<string, string[]>;
	configHealthy: boolean;
	configConfigured: boolean;
	lastSuccessAt: string | null;
	error: string | null;
};

const DEFAULT_CONFIG: FeatureFlagConfig = {
	maintenanceModes: { analytics: { disableRevenueMetrics: false } },
	disableOverageBillingFlags: {},
	configHealthy: false,
	configConfigured: false,
	lastSuccessAt: null,
	error: null,
};

const getStatusMessage = ({ config }: { config: FeatureFlagConfig }) => {
	if (config.configConfigured === false) {
		return "Feature flags config is missing in S3, so every flag below stays off.";
	}

	return config.error ?? "Saved changes reach all servers within 10 seconds.";
};

export function FeatureFlagsDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const axiosInstance = useAxiosInstance();
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [config, setConfig] = useState<FeatureFlagConfig>(DEFAULT_CONFIG);
	const [jsonText, setJsonText] = useState("");
	const [jsonError, setJsonError] = useState<string | null>(null);
	const [syncSource, setSyncSource] = useState<"form" | "json">("form");
	const [newOrgId, setNewOrgId] = useState("");
	const [newCustomerIds, setNewCustomerIds] = useState("");

	useEffect(() => {
		if (!open) return;

		let cancelled = false;
		setLoading(true);

		void axiosInstance
			.get<FeatureFlagConfig>("/admin/feature-flags-config")
			.then(({ data }) => {
				if (cancelled) return;
				const merged: FeatureFlagConfig = {
					...DEFAULT_CONFIG,
					...data,
					maintenanceModes: {
						...DEFAULT_CONFIG.maintenanceModes,
						...(data.maintenanceModes ?? {}),
						analytics: {
							...DEFAULT_CONFIG.maintenanceModes.analytics,
							...(data.maintenanceModes?.analytics ?? {}),
						},
					},
					disableOverageBillingFlags: {
						...DEFAULT_CONFIG.disableOverageBillingFlags,
						...(data.disableOverageBillingFlags ?? {}),
					},
				};
				setConfig(merged);
				const {
					configHealthy: _h,
					configConfigured: _c,
					lastSuccessAt: _l,
					error: _e,
					...flagsOnly
				} = merged;
				setJsonText(JSON.stringify(flagsOnly, null, 2));
				setSyncSource("form");
			})
			.catch((error) => {
				if (!cancelled)
					toast.error(getBackendErr(error, "Failed to load feature flags"));
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [axiosInstance, open]);

	// Form -> JSON sync
	useEffect(() => {
		if (syncSource !== "form") return;
		const {
			configHealthy: _h,
			configConfigured: _c,
			lastSuccessAt: _l,
			error: _e,
			...flagsOnly
		} = config;
		setJsonText(JSON.stringify(flagsOnly, null, 2));
		setJsonError(null);
	}, [config, syncSource]);

	const setFlag = (path: string[], value: boolean) => {
		setSyncSource("form");
		setConfig((prev) => {
			const next = structuredClone(prev);
			let node: Record<string, unknown> = next as unknown as Record<
				string,
				unknown
			>;
			for (let i = 0; i < path.length - 1; i++) {
				node = node[path[i]] as Record<string, unknown>;
			}
			node[path[path.length - 1]] = value;
			return next;
		});
	};

	const handleJsonChange = (value: string | undefined) => {
		const text = value ?? "";
		setJsonText(text);
		setSyncSource("json");
		try {
			const parsed = JSON.parse(text) as Partial<FeatureFlagConfig>;
			setConfig((prev) => ({
				...prev,
				maintenanceModes: {
					...DEFAULT_CONFIG.maintenanceModes,
					...(parsed.maintenanceModes ?? {}),
					analytics: {
						...DEFAULT_CONFIG.maintenanceModes.analytics,
						...(parsed.maintenanceModes?.analytics ?? {}),
					},
				},
				disableOverageBillingFlags:
					parsed.disableOverageBillingFlags ?? prev.disableOverageBillingFlags,
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

		setSaving(true);
		try {
			await axiosInstance.put("/admin/feature-flags-config", payload);
			toast.success("Feature flags saved");
			onOpenChange(false);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to save feature flags"));
		} finally {
			setSaving(false);
		}
	};

	const addDisableOverageBillingEntry = () => {
		if (!newOrgId.trim() || !newCustomerIds.trim()) return;
		const orgId = newOrgId.trim();
		const customerIds = newCustomerIds
			.split(",")
			.map((id) => id.trim())
			.filter(Boolean);
		if (customerIds.length === 0) return;

		setSyncSource("form");
		setConfig((prev) => ({
			...prev,
			disableOverageBillingFlags: {
				...prev.disableOverageBillingFlags,
				[orgId]: customerIds,
			},
		}));
		setNewOrgId("");
		setNewCustomerIds("");
	};

	const removeDisableOverageBillingEntry = (orgId: string) => {
		setSyncSource("form");
		setConfig((prev) => {
			const next = { ...prev.disableOverageBillingFlags };
			delete next[orgId];
			return { ...prev, disableOverageBillingFlags: next };
		});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-4xl bg-card">
				<DialogHeader>
					<DialogTitle className="text-balance">Feature Flags</DialogTitle>
					<DialogDescription className="text-pretty">
						Kill switches for live behavior. Everything here takes effect the
						moment you save.
					</DialogDescription>
				</DialogHeader>

				{loading && (
					<div className="grid grid-cols-[300px_1fr] gap-6">
						<Skeleton className="h-64" />
						<Skeleton className="h-64" />
					</div>
				)}

				{!loading && (
					<div className="grid grid-cols-[300px_1fr] gap-6">
						<div className="flex flex-col gap-4">
							<div className="text-xs font-medium text-tertiary-foreground uppercase tracking-wide">
								Maintenance modes
							</div>

							<div className="flex items-center justify-between gap-6 rounded-lg border border-border p-3">
								<div className="flex flex-col gap-1">
									<div className="text-sm font-medium text-foreground">
										Turn off revenue metrics
									</div>
									<div className="text-pretty text-xs text-tertiary-foreground">
										Revenue charts and endpoints stop returning data.
									</div>
								</div>
								<Switch
									aria-label="Turn off revenue metrics"
									checked={
										config.maintenanceModes.analytics.disableRevenueMetrics
									}
									onCheckedChange={(value) =>
										setFlag(
											[
												"maintenanceModes",
												"analytics",
												"disableRevenueMetrics",
											],
											value,
										)
									}
								/>
							</div>

							<div className="flex flex-col gap-1">
								<div className="text-xs font-medium text-tertiary-foreground uppercase tracking-wide">
									Overage billing exemptions
								</div>
								<div className="text-pretty text-xs text-tertiary-foreground">
									Listed customers stop being billed for overages.
								</div>
							</div>
							<div className="rounded-lg border border-border p-3 flex flex-col gap-2">
								{Object.entries(config.disableOverageBillingFlags).length ===
									0 && (
									<div className="text-pretty text-xs text-tertiary-foreground italic">
										No exemptions — every customer is billed for overages.
									</div>
								)}
								{Object.entries(config.disableOverageBillingFlags).map(
									([orgId, customerIds]) => (
										<div
											key={orgId}
											className="flex items-center justify-between gap-2"
										>
											<div className="min-w-0 flex-1">
												<div className="text-xs font-mono text-foreground truncate">
													{orgId}
												</div>
												<div className="text-xs text-tertiary-foreground truncate">
													{customerIds.join(", ")}
												</div>
											</div>
											<Button
												variant="secondary"
												size="sm"
												onClick={() => removeDisableOverageBillingEntry(orgId)}
											>
												Remove
											</Button>
										</div>
									),
								)}
								<div className="flex flex-col gap-2 pt-2 border-t border-border">
									<Input
										type="text"
										placeholder="Org ID"
										value={newOrgId}
										onChange={(e) => setNewOrgId(e.target.value)}
									/>
									<Input
										type="text"
										placeholder="Customer IDs (comma-separated)"
										value={newCustomerIds}
										onChange={(e) => setNewCustomerIds(e.target.value)}
									/>
									<Button
										variant="secondary"
										size="sm"
										onClick={addDisableOverageBillingEntry}
										disabled={!newOrgId.trim() || !newCustomerIds.trim()}
									>
										Add
									</Button>
								</div>
							</div>

							<div className="flex flex-col gap-3 text-xs text-tertiary-foreground">
								<Separator />
								<div className="flex flex-wrap items-center gap-2">
									<Badge variant="muted">
										{config.configHealthy
											? "Config healthy"
											: "Config unavailable"}
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
