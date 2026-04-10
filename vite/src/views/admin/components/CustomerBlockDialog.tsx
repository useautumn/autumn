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

const ENV_OPTIONS = ["sandbox", "live"] as const;

type CustomerBlockEnv = (typeof ENV_OPTIONS)[number];

type CustomerBlockEntry = {
	updatedAt?: string;
	updatedBy?: string;
};

type CustomerBlockOrgEntries = {
	sandbox: Record<string, CustomerBlockEntry>;
	live: Record<string, CustomerBlockEntry>;
};

type CustomerBlockConfig = {
	orgs: Record<string, CustomerBlockOrgEntries>;
	configHealthy: boolean;
	configConfigured: boolean;
	lastSuccessAt: string | null;
	error: string | null;
};

const createDefaultOrgEntries = (): CustomerBlockOrgEntries => ({
	sandbox: {},
	live: {},
});

const DEFAULT_CONFIG: CustomerBlockConfig = {
	orgs: {},
	configHealthy: false,
	configConfigured: false,
	lastSuccessAt: null,
	error: null,
};

const normalizeEditableConfig = (parsed?: {
	orgs?: Record<
		string,
		Partial<Record<CustomerBlockEnv, Record<string, CustomerBlockEntry>>>
	>;
}) => {
	const orgs = Object.fromEntries(
		Object.entries(parsed?.orgs ?? {}).map(([orgId, orgEntries]) => [
			orgId,
			{
				sandbox: orgEntries?.sandbox ?? {},
				live: orgEntries?.live ?? {},
			},
		]),
	);

	return { orgs };
};

const getEditableConfig = ({ config }: { config: CustomerBlockConfig }) => ({
	orgs: config.orgs,
});

const getEntryRows = ({ config }: { config: CustomerBlockConfig }) => {
	return Object.entries(config.orgs)
		.flatMap(([orgId, orgEntries]) =>
			ENV_OPTIONS.flatMap((env) =>
				Object.entries(orgEntries[env]).map(([customerId, entry]) => ({
					orgId,
					env,
					customerId,
					updatedAt: entry.updatedAt ?? null,
					updatedBy: entry.updatedBy ?? null,
				})),
			),
		)
		.sort((left, right) => {
			return `${left.orgId}:${left.env}:${left.customerId}`.localeCompare(
				`${right.orgId}:${right.env}:${right.customerId}`,
			);
		});
};

export function CustomerBlockDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const axiosInstance = useAxiosInstance();
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [config, setConfig] = useState<CustomerBlockConfig>(DEFAULT_CONFIG);
	const [jsonText, setJsonText] = useState("");
	const [jsonError, setJsonError] = useState<string | null>(null);
	const [syncSource, setSyncSource] = useState<"form" | "json">("form");
	const [newOrgId, setNewOrgId] = useState("");
	const [newEnv, setNewEnv] = useState<CustomerBlockEnv>("sandbox");
	const [newCustomerId, setNewCustomerId] = useState("");

	useEffect(() => {
		if (!open) return;

		let cancelled = false;
		setLoading(true);

		void axiosInstance
			.get<CustomerBlockConfig>("/admin/customer-block-config")
			.then(({ data }) => {
				if (cancelled) return;
				const editableConfig = normalizeEditableConfig(data);
				const mergedConfig: CustomerBlockConfig = {
					...DEFAULT_CONFIG,
					...data,
					...editableConfig,
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
						getBackendErr(error, "Failed to load customer block config"),
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

	const entryRows = useMemo(() => getEntryRows({ config }), [config]);

	const handleJsonChange = (value: string | undefined) => {
		const text = value ?? "";
		setJsonText(text);
		setSyncSource("json");

		try {
			const parsed = JSON.parse(text) as {
				orgs?: Record<
					string,
					Partial<Record<CustomerBlockEnv, Record<string, CustomerBlockEntry>>>
				>;
			};
			const editableConfig = normalizeEditableConfig(parsed);
			setConfig((current) => ({
				...current,
				...editableConfig,
			}));
			setJsonError(null);
		} catch {
			setJsonError("Invalid JSON");
		}
	};

	const addEntry = async () => {
		const orgIdOrSlug = newOrgId.trim();
		const customerId = newCustomerId.trim();

		if (!orgIdOrSlug || !customerId) return;

		setSyncSource("form");
		setConfig((current) => {
			const nextConfig = structuredClone(current);
			const orgEntries =
				nextConfig.orgs[orgIdOrSlug] ?? createDefaultOrgEntries();

			orgEntries[newEnv][customerId] = {
				updatedAt: new Date().toISOString(),
			};
			nextConfig.orgs[orgIdOrSlug] = orgEntries;

			return nextConfig;
		});
		setNewCustomerId("");
	};

	const removeEntry = ({
		orgId,
		env,
		customerId,
	}: {
		orgId: string;
		env: CustomerBlockEnv;
		customerId: string;
	}) => {
		setSyncSource("form");
		setConfig((current) => {
			const nextConfig = structuredClone(current);
			delete nextConfig.orgs[orgId]?.[env][customerId];

			const orgEntries = nextConfig.orgs[orgId];
			const hasSandboxEntries =
				Object.keys(orgEntries?.sandbox ?? {}).length > 0;
			const hasLiveEntries = Object.keys(orgEntries?.live ?? {}).length > 0;

			if (!hasSandboxEntries && !hasLiveEntries) {
				delete nextConfig.orgs[orgId];
			}

			return nextConfig;
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
			await axiosInstance.put("/admin/customer-block-config", payload);
			toast.success("Customer block config saved");
			onOpenChange(false);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to save customer block config"));
		} finally {
			setSaving(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-5xl bg-card">
				<DialogHeader>
					<DialogTitle>Customer Blocking</DialogTitle>
					<DialogDescription>
						Block API traffic for a specific org, environment, and customer
						combination.
					</DialogDescription>
				</DialogHeader>

				{loading ? (
					<div className="py-8 text-center text-sm text-t3">Loading...</div>
				) : (
					<div className="grid grid-cols-[320px_1fr] gap-6">
						<div className="flex flex-col gap-4">
							<div className="text-xs font-medium uppercase tracking-wide text-t3">
								Blocked Customers
							</div>

							<div className="rounded-lg border border-border p-3">
								<div className="mb-3 flex flex-col gap-2">
									<Input
										placeholder="Org ID or slug"
										value={newOrgId}
										onChange={(event) => setNewOrgId(event.target.value)}
									/>
									<select
										value={newEnv}
										onChange={(event) =>
											setNewEnv(event.target.value as CustomerBlockEnv)
										}
										className="h-input rounded-lg border border-input bg-transparent px-3 text-sm text-t1 shadow-sm"
									>
										{ENV_OPTIONS.map((env) => (
											<option key={env} value={env}>
												{env}
											</option>
										))}
									</select>
									<Input
										placeholder="Customer ID"
										value={newCustomerId}
										onChange={(event) => setNewCustomerId(event.target.value)}
									/>
									<Button
										variant="secondary"
										size="sm"
										onClick={() => void addEntry()}
										disabled={!newOrgId.trim() || !newCustomerId.trim()}
									>
										Add blocked customer
									</Button>
								</div>

								<div className="flex flex-col gap-2 border-t border-border pt-3">
									{entryRows.length === 0 ? (
										<div className="text-xs italic text-t3">
											No blocked customers
										</div>
									) : (
										entryRows.map((entry) => (
											<div
												key={`${entry.orgId}:${entry.env}:${entry.customerId}`}
												className="flex items-start justify-between gap-3 rounded-lg border border-border p-2"
											>
												<div className="min-w-0 flex-1">
													<div className="truncate font-mono text-xs text-t1">
														{entry.orgId}
													</div>
													<div className="truncate text-xs text-t2">
														{entry.env} / {entry.customerId}
													</div>
													{entry.updatedAt && (
														<div className="text-[11px] text-t3">
															Updated{" "}
															{new Date(entry.updatedAt).toLocaleString()}
														</div>
													)}
												</div>
												<Button
													variant="secondary"
													size="sm"
													onClick={() => removeEntry(entry)}
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
										? "S3 customer block config is not configured."
										: config.error || "Blocks update within 30s of saving."}
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
