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
	ScrollArea,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@autumn/ui";
import Editor from "@monaco-editor/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import {
	type RateLimitOverrideEntry,
	RateLimitOverrideOrgCard,
} from "./RateLimitOverrideOrgCard";

type RateLimitDefault = {
	limit: number;
	windowMs: number;
	scope: string;
};

type RateLimitOverridesConfig = {
	orgs: Record<string, { limits: Record<string, number> }>;
	defaults: Record<string, RateLimitDefault>;
	configHealthy: boolean;
	configConfigured: boolean;
	lastSuccessAt: string | null;
	error: string | null;
};

const DEFAULT_CONFIG: RateLimitOverridesConfig = {
	orgs: {},
	defaults: {},
	configHealthy: false,
	configConfigured: false,
	lastSuccessAt: null,
	error: null,
};

const getEditableConfig = ({
	config,
}: {
	config: RateLimitOverridesConfig;
}) => ({
	orgs: config.orgs,
});

type OrgEntryGroup = {
	orgId: string;
	entries: RateLimitOverrideEntry[];
};

const getOrgEntryGroups = ({
	config,
}: {
	config: RateLimitOverridesConfig;
}): OrgEntryGroup[] => {
	const groups: OrgEntryGroup[] = [];
	const orgs = Object.entries(config.orgs);
	orgs.sort(([leftOrgId], [rightOrgId]) => leftOrgId.localeCompare(rightOrgId));

	for (const [orgId, entry] of orgs) {
		const limits = Object.entries(entry.limits ?? {});
		limits.sort(([leftType], [rightType]) => leftType.localeCompare(rightType));

		const entries: RateLimitOverrideEntry[] = [];
		for (const [type, limit] of limits) {
			entries.push({
				type,
				limit,
				defaultLimit: config.defaults[type]?.limit,
			});
		}
		if (entries.length > 0) groups.push({ orgId, entries });
	}

	return groups;
};

export function RateLimitOverridesDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const axiosInstance = useAxiosInstance();
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [config, setConfig] =
		useState<RateLimitOverridesConfig>(DEFAULT_CONFIG);
	const [jsonText, setJsonText] = useState("");
	const [jsonError, setJsonError] = useState<string | null>(null);
	const [syncSource, setSyncSource] = useState<"form" | "json">("form");
	const [newOrgId, setNewOrgId] = useState("");
	const [newType, setNewType] = useState<string | undefined>();
	const [newLimit, setNewLimit] = useState("");

	useEffect(() => {
		if (!open) return;

		let cancelled = false;
		setLoading(true);

		void axiosInstance
			.get<RateLimitOverridesConfig>("/admin/rate-limit-overrides-config")
			.then(({ data }) => {
				if (cancelled) return;
				const mergedConfig: RateLimitOverridesConfig = {
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
					toast.error(
						getBackendErr(error, "Failed to load rate limit overrides"),
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
		setJsonText(JSON.stringify(getEditableConfig({ config }), null, 2));
		setJsonError(null);
	}, [config, syncSource]);

	const orgEntryGroups = useMemo(() => getOrgEntryGroups({ config }), [config]);
	const rateLimitTypes = useMemo(
		() => Object.keys(config.defaults).sort(),
		[config.defaults],
	);

	const handleJsonChange = (value: string | undefined) => {
		const text = value ?? "";
		setJsonText(text);
		setSyncSource("json");

		try {
			const parsed = JSON.parse(text) as {
				orgs?: Record<string, { limits?: Record<string, number> }>;
			};
			const orgs: Record<string, { limits: Record<string, number> }> = {};
			for (const [orgId, entry] of Object.entries(parsed.orgs ?? {})) {
				orgs[orgId] = { limits: entry?.limits ?? {} };
			}
			setConfig((current) => ({ ...current, orgs }));
			setJsonError(null);
		} catch {
			setJsonError("Invalid JSON");
		}
	};

	const addEntry = () => {
		const orgId = newOrgId.trim();
		const type = newType;
		const limit = Number.parseInt(newLimit.trim(), 10);

		if (!orgId || !type || Number.isNaN(limit) || limit < 0) return;

		setSyncSource("form");
		setConfig((current) => {
			const nextOrgs = { ...current.orgs };
			const existing = nextOrgs[orgId]?.limits ?? {};
			nextOrgs[orgId] = { limits: { ...existing, [type]: limit } };
			return { ...current, orgs: nextOrgs };
		});
		setNewOrgId("");
		setNewType(undefined);
		setNewLimit("");
	};

	const removeEntry = ({ orgId, type }: { orgId: string; type: string }) => {
		setSyncSource("form");
		setConfig((current) => {
			const nextOrgs = { ...current.orgs };
			if (!nextOrgs[orgId]) return current;
			const { [type]: _removed, ...rest } = nextOrgs[orgId].limits;
			if (Object.keys(rest).length === 0) {
				delete nextOrgs[orgId];
			} else {
				nextOrgs[orgId] = { limits: rest };
			}
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
			await axiosInstance.put("/admin/rate-limit-overrides-config", payload);
			toast.success("Rate limit overrides saved");
			onOpenChange(false);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to save rate limit overrides"));
		} finally {
			setSaving(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[calc(100dvh-2rem)] max-w-5xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-card">
				<DialogHeader>
					<DialogTitle>Rate Limit Overrides</DialogTitle>
					<DialogDescription>
						Override per-org rate limits. The org key accepts either an org ID
						or an org slug. Leaving an entry unset falls back to the hardcoded
						default for that bucket.
					</DialogDescription>
				</DialogHeader>

				<ScrollArea className="min-h-0">
					{loading ? (
						<div className="py-8 text-center text-sm text-tertiary-foreground">
							Loading...
						</div>
					) : (
						<div className="grid grid-cols-[360px_1fr] gap-6 pr-3">
							<div className="flex flex-col gap-4">
								<div className="text-xs font-medium uppercase tracking-wide text-tertiary-foreground">
									Override Entries
								</div>

								<div className="rounded-lg border border-border p-3">
									<div className="mb-3 flex flex-col gap-2">
										<Input
											placeholder="Org ID or slug (e.g. mintlify)"
											value={newOrgId}
											onChange={(event) => setNewOrgId(event.target.value)}
										/>
										<Select
											value={newType}
											onValueChange={(value: string) => setNewType(value)}
										>
											<SelectTrigger className="h-9 w-full">
												<SelectValue placeholder="Rate limit type..." />
											</SelectTrigger>
											<SelectContent>
												{rateLimitTypes.map((type) => (
													<SelectItem key={type} value={type}>
														<span className="font-mono text-xs">{type}</span>
														{config.defaults[type] && (
															<span className="ml-2 text-[11px] text-tertiary-foreground">
																(default {config.defaults[type].limit}/
																{config.defaults[type].windowMs}ms)
															</span>
														)}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<Input
											placeholder="Limit (e.g. 200)"
											type="number"
											min={0}
											value={newLimit}
											onChange={(event) => setNewLimit(event.target.value)}
										/>
										<Button
											variant="secondary"
											size="sm"
											onClick={addEntry}
											disabled={
												!newOrgId.trim() ||
												!newType ||
												!newLimit.trim() ||
												Number.isNaN(Number.parseInt(newLimit, 10)) ||
												Number.parseInt(newLimit, 10) < 0
											}
										>
											Add override
										</Button>
									</div>

									<div className="flex flex-col gap-2 border-t border-border pt-3">
										{orgEntryGroups.length === 0 ? (
											<div className="text-xs italic text-tertiary-foreground">
												No overrides — all orgs use the hardcoded defaults.
											</div>
										) : (
											orgEntryGroups.map(({ orgId, entries }) => (
												<RateLimitOverrideOrgCard
													key={orgId}
													orgId={orgId}
													entries={entries}
													onRemove={removeEntry}
												/>
											))
										)}
									</div>
								</div>

								<div className="rounded-lg border border-border p-3 text-xs text-tertiary-foreground">
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
											? "S3 rate-limit overrides config is not configured."
											: config.error ||
												"Overrides take effect on the next request after polling refresh (10s)."}
									</div>
								</div>
							</div>

							<div className="flex flex-col gap-2">
								<div className="text-xs font-medium uppercase tracking-wide text-tertiary-foreground">
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
				</ScrollArea>

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
