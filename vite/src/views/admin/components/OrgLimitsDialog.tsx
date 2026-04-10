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

const DEFAULT_CUS_PRODUCT_LIMIT = 15;

type OrgLimitsEntry = {
	maxCusProducts?: number;
};

type OrgLimitsConfig = {
	orgs: Record<string, OrgLimitsEntry>;
	configHealthy: boolean;
	configConfigured: boolean;
	lastSuccessAt: string | null;
	error: string | null;
};

const DEFAULT_CONFIG: OrgLimitsConfig = {
	orgs: {},
	configHealthy: false,
	configConfigured: false,
	lastSuccessAt: null,
	error: null,
};

const getEditableConfig = ({ config }: { config: OrgLimitsConfig }) => ({
	orgs: config.orgs,
});

const getEntryRows = ({ config }: { config: OrgLimitsConfig }) => {
	return Object.entries(config.orgs)
		.map(([orgId, entry]) => ({
			orgId,
			maxCusProducts: entry.maxCusProducts ?? DEFAULT_CUS_PRODUCT_LIMIT,
		}))
		.sort((a, b) => a.orgId.localeCompare(b.orgId));
};

export function OrgLimitsDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const axiosInstance = useAxiosInstance();
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [config, setConfig] = useState<OrgLimitsConfig>(DEFAULT_CONFIG);
	const [jsonText, setJsonText] = useState("");
	const [jsonError, setJsonError] = useState<string | null>(null);
	const [syncSource, setSyncSource] = useState<"form" | "json">("form");
	const [newOrgId, setNewOrgId] = useState("");
	const [newLimit, setNewLimit] = useState("");

	useEffect(() => {
		if (!open) return;

		let cancelled = false;
		setLoading(true);

		void axiosInstance
			.get<OrgLimitsConfig>("/admin/org-limits-config")
			.then(({ data }) => {
				if (cancelled) return;
				const mergedConfig: OrgLimitsConfig = {
					...DEFAULT_CONFIG,
					...data,
				};
				setConfig(mergedConfig);
				setJsonText(
					JSON.stringify(getEditableConfig({ config: mergedConfig }), null, 2),
				);
				setJsonError(null);
				setSyncSource("form");
			})
			.catch((error) => {
				if (!cancelled) {
					toast.error(getBackendErr(error, "Failed to load org limits config"));
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
		setJsonText(JSON.stringify(getEditableConfig({ config }), null, 2));
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

		setSaving(true);
		try {
			await axiosInstance.put("/admin/org-limits-config", payload);
			toast.success("Org limits config saved");
			onOpenChange(false);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to save org limits config"));
		} finally {
			setSaving(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-5xl bg-card">
				<DialogHeader>
					<DialogTitle>Org Limits</DialogTitle>
					<DialogDescription>
						Configure per-org limits such as max customer products returned in
						queries. Default is {DEFAULT_CUS_PRODUCT_LIMIT}.
					</DialogDescription>
				</DialogHeader>

				{loading ? (
					<div className="py-8 text-center text-sm text-t3">Loading...</div>
				) : (
					<div className="grid grid-cols-[320px_1fr] gap-6">
						<div className="flex flex-col gap-4">
							<div className="text-xs font-medium uppercase tracking-wide text-t3">
								Org Overrides
							</div>

							<div className="rounded-lg border border-border p-3">
								<div className="mb-3 flex flex-col gap-2">
									<Input
										placeholder="Org ID or slug"
										value={newOrgId}
										onChange={(event) => setNewOrgId(event.target.value)}
									/>
									<Input
										placeholder="Max cusProducts (e.g. 30)"
										type="number"
										min={1}
										value={newLimit}
										onChange={(event) => setNewLimit(event.target.value)}
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
									{entryRows.length === 0 ? (
										<div className="text-xs italic text-t3">
											No org overrides — all orgs use default (
											{DEFAULT_CUS_PRODUCT_LIMIT})
										</div>
									) : (
										entryRows.map((entry) => (
											<div
												key={entry.orgId}
												className="flex items-start justify-between gap-3 rounded-lg border border-border p-2"
											>
												<div className="min-w-0 flex-1">
													<div className="truncate font-mono text-xs text-t1">
														{entry.orgId}
													</div>
													<div className="text-xs text-t2">
														maxCusProducts: {entry.maxCusProducts}
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
										? "S3 org limits config is not configured."
										: config.error ||
											"Limits update within 5 minutes of saving."}
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
