import Editor from "@monaco-editor/react";
import { useEffect, useState } from "react";
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
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

type FeatureFlagConfig = {
	maintenanceModes: {
		analytics: {
			disableRevenueMetrics: boolean;
		};
	};
	configHealthy: boolean;
	configConfigured: boolean;
	lastSuccessAt: string | null;
	error: string | null;
};

const DEFAULT_CONFIG: FeatureFlagConfig = {
	maintenanceModes: { analytics: { disableRevenueMetrics: false } },
	configHealthy: false,
	configConfigured: false,
	lastSuccessAt: null,
	error: null,
};

function FlagToggle({
	label,
	description,
	checked,
	onChange,
}: {
	label: string;
	description: string;
	checked: boolean;
	onChange: (v: boolean) => void;
}) {
	return (
		<div className="flex items-center justify-between rounded-lg border border-border p-3">
			<div className="flex flex-col gap-0.5">
				<div className="text-sm font-medium text-t1">{label}</div>
				<div className="text-xs text-t3">{description}</div>
			</div>
			<button
				type="button"
				role="switch"
				aria-checked={checked}
				onClick={() => onChange(!checked)}
				className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none ${
					checked ? "bg-red-500" : "bg-input"
				}`}
			>
				<span
					className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg transform transition-transform ${
						checked ? "translate-x-4" : "translate-x-0"
					}`}
				/>
			</button>
		</div>
	);
}

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
				};
				setConfig(merged);
				const { configHealthy: _h, configConfigured: _c, lastSuccessAt: _l, error: _e, ...flagsOnly } = merged;
				setJsonText(JSON.stringify(flagsOnly, null, 2));
				setSyncSource("form");
			})
			.catch((error) => {
				if (!cancelled) toast.error(getBackendErr(error, "Failed to load feature flags"));
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [axiosInstance, open]);

	// Form → JSON sync
	useEffect(() => {
		if (syncSource !== "form") return;
		const { configHealthy: _h, configConfigured: _c, lastSuccessAt: _l, error: _e, ...flagsOnly } = config;
		setJsonText(JSON.stringify(flagsOnly, null, 2));
		setJsonError(null);
	}, [config, syncSource]);

	const setFlag = (path: string[], value: boolean) => {
		setSyncSource("form");
		setConfig((prev) => {
			const next = structuredClone(prev);
			let node: Record<string, unknown> = next as unknown as Record<string, unknown>;
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

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-4xl bg-card">
				<DialogHeader>
					<DialogTitle>Feature Flags</DialogTitle>
					<DialogDescription>
						Toggle flags on/off. Changes propagate to all servers within 30 seconds.
					</DialogDescription>
				</DialogHeader>

				{loading ? (
					<div className="py-8 text-sm text-t3 text-center">Loading...</div>
				) : (
					<div className="grid grid-cols-[300px_1fr] gap-6">
						{/* Left: toggles */}
						<div className="flex flex-col gap-4">
							<div className="text-xs font-medium text-t3 uppercase tracking-wide">Maintenance Modes</div>

							<FlagToggle
								label="Disable Revenue Metrics"
								description="Disables revenue analytics charts and API endpoints."
								checked={config.maintenanceModes.analytics.disableRevenueMetrics}
								onChange={(v) => setFlag(["maintenanceModes", "analytics", "disableRevenueMetrics"], v)}
							/>

							<div className="rounded-lg border border-border p-3 text-xs text-t3">
								<div className="mb-2 flex items-center gap-2">
									<Badge
										variant="muted"
										className={
											config.configHealthy
												? "bg-emerald-50 text-emerald-700 border-emerald-200"
												: "bg-amber-50 text-amber-700 border-amber-200"
										}
									>
										{config.configHealthy ? "Config healthy" : "Config unavailable"}
									</Badge>
									{config.lastSuccessAt && (
										<span>Last refresh: {new Date(config.lastSuccessAt).toLocaleString()}</span>
									)}
								</div>
								<div>
									{config.configConfigured === false
										? "S3 feature flags config is not configured."
										: config.error || "Flags update within 30s of saving."}
								</div>
							</div>
						</div>

						{/* Right: Monaco */}
						<div className="flex flex-col gap-2">
							<div className="text-xs font-medium text-t3 uppercase tracking-wide">Raw JSON</div>
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
							{jsonError && <div className="text-xs text-red-500">{jsonError}</div>}
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
