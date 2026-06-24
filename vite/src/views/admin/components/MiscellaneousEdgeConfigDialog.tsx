import {
	Badge,
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@autumn/ui";
import Editor from "@monaco-editor/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

type MiscellaneousEdgeConfig = {
	newFlatCusModel: string[];
	configHealthy: boolean;
	configConfigured: boolean;
	lastSuccessAt: string | null;
	error: string | null;
};

const DEFAULT_CONFIG: MiscellaneousEdgeConfig = {
	newFlatCusModel: [],
	configHealthy: false,
	configConfigured: false,
	lastSuccessAt: null,
	error: null,
};

export function MiscellaneousEdgeConfigDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const axiosInstance = useAxiosInstance();
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [config, setConfig] = useState<MiscellaneousEdgeConfig>(DEFAULT_CONFIG);
	const [jsonText, setJsonText] = useState("");
	const [jsonError, setJsonError] = useState<string | null>(null);
	const [syncSource, setSyncSource] = useState<"form" | "json">("form");

	const [newEntry, setNewEntry] = useState("");

	useEffect(() => {
		if (!open) return;

		let cancelled = false;
		setLoading(true);

		void axiosInstance
			.get<MiscellaneousEdgeConfig>("/admin/miscellaneous-edge-config")
			.then(({ data }) => {
				if (cancelled) return;
				const merged: MiscellaneousEdgeConfig = {
					...DEFAULT_CONFIG,
					...data,
					newFlatCusModel: data.newFlatCusModel ?? [],
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
					toast.error(
						getBackendErr(error, "Failed to load miscellaneous edge config"),
					);
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

	const handleJsonChange = (value: string | undefined) => {
		const text = value ?? "";
		setJsonText(text);
		setSyncSource("json");
		try {
			const parsed = JSON.parse(text) as Partial<MiscellaneousEdgeConfig>;
			setConfig((prev) => ({
				...prev,
				newFlatCusModel: parsed.newFlatCusModel ?? prev.newFlatCusModel,
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
			await axiosInstance.put("/admin/miscellaneous-edge-config", payload);
			toast.success("Miscellaneous edge config saved");
			onOpenChange(false);
		} catch (error) {
			toast.error(
				getBackendErr(error, "Failed to save miscellaneous edge config"),
			);
		} finally {
			setSaving(false);
		}
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
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-4xl bg-card">
				<DialogHeader>
					<DialogTitle>Miscellaneous Edge Config</DialogTitle>
					<DialogDescription>
						Catch-all config for one-off rollout switches. Changes propagate to
						all servers within 30 seconds.
					</DialogDescription>
				</DialogHeader>

				{loading ? (
					<div className="py-8 text-sm text-tertiary-foreground text-center">
						Loading...
					</div>
				) : (
					<div className="grid grid-cols-[300px_1fr] gap-6">
						<div className="flex flex-col gap-4">
							<div className="text-xs font-medium text-tertiary-foreground uppercase tracking-wide">
								New Flat Cus Model
							</div>
							<div className="text-[11px] text-tertiary-foreground -mt-2">
								Allowlist of{" "}
								<span className="font-mono">orgId:env:customerId</span> keys
								that opt into the new set-based{" "}
								<span className="font-mono">getFull</span> query path.
							</div>
							<div className="rounded-lg border border-border p-3 flex flex-col gap-2">
								{config.newFlatCusModel.length === 0 && (
									<div className="text-xs text-tertiary-foreground italic">
										No entries
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
										<button
											type="button"
											onClick={() => removeEntry(entry)}
											className="shrink-0 text-tertiary-foreground hover:text-red-500 transition-colors"
										>
											<svg
												width="14"
												height="14"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												strokeWidth="2"
												role="img"
												aria-label="Remove entry"
											>
												<title>Remove entry</title>
												<path d="M18 6L6 18M6 6l12 12" />
											</svg>
										</button>
									</div>
								))}
								<div className="flex flex-col gap-2 pt-2 border-t border-border">
									<input
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
										className="w-full px-2 py-1 text-xs rounded border border-border bg-input text-foreground placeholder:text-tertiary-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
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

							<div className="rounded-lg border border-border p-3 text-xs text-tertiary-foreground">
								<div className="mb-2 flex items-center gap-2">
									<Badge
										variant="muted"
										className={
											config.configHealthy
												? "bg-emerald-50 text-emerald-700 border-emerald-200"
												: "bg-amber-50 text-amber-700 border-amber-200"
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
										? "S3 miscellaneous edge config is not configured."
										: config.error || "Config updates within 30s of saving."}
								</div>
							</div>
						</div>

						<div className="flex flex-col gap-2">
							<div className="text-xs font-medium text-tertiary-foreground uppercase tracking-wide">
								Raw JSON
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
