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
	Skeleton,
} from "@autumn/ui";
import Editor from "@monaco-editor/react";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

type RequestBlockRule = {
	method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD";
	pattern: string;
};

type RequestBlockResponse = {
	blockAll: boolean;
	blockedEndpoints: RequestBlockRule[];
	updatedAt: string | null;
	updatedBy: string | null;
	configHealthy: boolean;
	configConfigured: boolean;
	lastSuccessAt: string | null;
	error: string | null;
};

const METHODS: RequestBlockRule["method"][] = [
	"GET",
	"POST",
	"PUT",
	"PATCH",
	"DELETE",
	"OPTIONS",
	"HEAD",
];

type Step = "select-org" | "edit";

export function EdgeConfigDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const axiosInstance = useAxiosInstance();
	const [step, setStep] = useState<Step>("select-org");
	const [orgIdInput, setOrgIdInput] = useState("");
	const [orgId, setOrgId] = useState<string | null>(null);

	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [blockAll, setBlockAll] = useState(false);
	const [rules, setRules] = useState<RequestBlockRule[]>([]);
	const [status, setStatus] = useState<RequestBlockResponse | null>(null);
	const [jsonText, setJsonText] = useState("");
	const [jsonError, setJsonError] = useState<string | null>(null);
	const [syncSource, setSyncSource] = useState<"form" | "json">("form");

	// Reset when dialog closes
	useEffect(() => {
		if (!open) {
			setStep("select-org");
			setOrgId(null);
			setOrgIdInput("");
			setBlockAll(false);
			setRules([]);
			setStatus(null);
			setJsonText("");
			setJsonError(null);
		}
	}, [open]);

	// Load data when org is selected
	useEffect(() => {
		if (!orgId || step !== "edit") return;

		let cancelled = false;
		setLoading(true);

		void axiosInstance
			.get<RequestBlockResponse>(`/admin/orgs/${orgId}/request-block`)
			.then(({ data }) => {
				if (cancelled) return;
				setStatus(data);
				setBlockAll(data.blockAll);
				setRules(data.blockedEndpoints);
				setSyncSource("form");
				setJsonText(
					JSON.stringify(
						{
							blockAll: data.blockAll,
							blockedEndpoints: data.blockedEndpoints,
						},
						null,
						2,
					),
				);
			})
			.catch((error) => {
				if (!cancelled) {
					toast.error(
						getBackendErr(error, "Failed to load request block state"),
					);
				}
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [axiosInstance, orgId, step]);

	// Form → JSON sync
	useEffect(() => {
		if (syncSource !== "form") return;
		setJsonText(JSON.stringify({ blockAll, blockedEndpoints: rules }, null, 2));
		setJsonError(null);
	}, [blockAll, rules, syncSource]);

	const handleBlockAllChange = (v: boolean) => {
		setSyncSource("form");
		setBlockAll(v);
	};

	const updateRule = (index: number, next: Partial<RequestBlockRule>) => {
		setSyncSource("form");
		setRules((current) =>
			current.map((r, i) => (i === index ? { ...r, ...next } : r)),
		);
	};

	const removeRule = (index: number) => {
		setSyncSource("form");
		setRules((current) => current.filter((_, i) => i !== index));
	};

	const addRule = () => {
		setSyncSource("form");
		setRules((current) => [...current, { method: "POST", pattern: "/v1/" }]);
	};

	const isValidRule = (item: unknown): item is RequestBlockRule => {
		if (!item || typeof item !== "object") return false;
		const r = item as Record<string, unknown>;
		return (
			typeof r.method === "string" &&
			(METHODS as readonly string[]).includes(r.method) &&
			typeof r.pattern === "string"
		);
	};

	const handleJsonChange = (value: string | undefined) => {
		const text = value ?? "";
		setJsonText(text);
		setSyncSource("json");
		try {
			const parsed = JSON.parse(text);
			if (typeof parsed.blockAll === "boolean") setBlockAll(parsed.blockAll);
			if (Array.isArray(parsed.blockedEndpoints)) {
				if (parsed.blockedEndpoints.every(isValidRule)) {
					setRules(parsed.blockedEndpoints);
				} else {
					setJsonError(
						`Each rule needs a pattern and a method (${METHODS.join(", ")}).`,
					);
					return;
				}
			}
			setJsonError(null);
		} catch {
			setJsonError("Invalid JSON");
		}
	};

	const canSave = useMemo(
		() => !jsonError && rules.every((r) => r.pattern.trim().startsWith("/v1/")),
		[jsonError, rules],
	);

	const handleSelectOrg = () => {
		const trimmed = orgIdInput.trim();
		if (!trimmed) {
			toast.error("Enter an org ID");
			return;
		}
		setOrgId(trimmed);
		setStep("edit");
	};

	const handleSave = async () => {
		if (!orgId || !canSave) {
			toast.error("Every blocked endpoint must start with /v1/");
			return;
		}
		setSaving(true);
		try {
			await axiosInstance.put(`/admin/orgs/${orgId}/request-block`, {
				blockAll,
				blockedEndpoints: rules.map((r) => ({
					method: r.method,
					pattern: r.pattern.trim(),
				})),
			});
			toast.success("Updated request block settings");
			onOpenChange(false);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to save request block state"));
		} finally {
			setSaving(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-4xl bg-card">
				<DialogHeader>
					<DialogTitle>
						Request Blocking — {orgId ? `Org: ${orgId}` : "Select Organization"}
					</DialogTitle>
					<DialogDescription className="text-pretty">
						{step === "select-org"
							? "Pick an org, then reject its API requests with a 403."
							: `Rejects ${orgId}'s /v1 API requests with a 403, in both sandbox and live.`}
					</DialogDescription>
				</DialogHeader>

				{step === "select-org" && (
					<div className="flex flex-col gap-4 py-2">
						<div className="flex flex-col gap-2">
							<label
								htmlFor="edge-config-org-id"
								className="text-sm font-medium text-foreground"
							>
								Organization ID
							</label>
							<div className="flex gap-2">
								<Input
									id="edge-config-org-id"
									placeholder="org_..."
									value={orgIdInput}
									onChange={(e) => setOrgIdInput(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") handleSelectOrg();
									}}
									className="flex-1"
								/>
								<Button variant="primary" onClick={handleSelectOrg}>
									Load
								</Button>
							</div>
						</div>
					</div>
				)}

				{step === "edit" && loading && (
					<div className="grid grid-cols-2 gap-6">
						<Skeleton className="h-80" />
						<Skeleton className="h-80" />
					</div>
				)}

				{step === "edit" && !loading && (
					<div className="grid grid-cols-2 gap-6">
						{/* Left: structured editor */}
						<div className="flex flex-col gap-4">
							<div className="text-xs font-medium text-tertiary-foreground uppercase tracking-wide">
								Structured Editor
							</div>

							{/* Block all toggle */}
							<div className="flex items-center justify-between rounded-lg border border-border p-3">
								<div className="flex flex-col gap-1">
									<div className="text-sm font-medium text-foreground">
										Block all /v1 requests
									</div>
									<div className="text-xs text-tertiary-foreground">
										Kill switch. Every /v1 call from this org gets a 403.
									</div>
								</div>
								<label
									htmlFor="edge-config-block-all"
									className="flex items-center gap-2 text-sm text-muted-foreground"
								>
									<input
										id="edge-config-block-all"
										type="checkbox"
										checked={blockAll}
										onChange={(e) => handleBlockAllChange(e.target.checked)}
									/>
									Enabled
								</label>
							</div>

							{/* Rules */}
							<div className="rounded-lg border border-border p-3">
								<div className="mb-3 flex items-center justify-between">
									<div>
										<div className="text-sm font-medium text-foreground">
											Blocked endpoints
										</div>
										<div className="text-xs text-tertiary-foreground">
											Block one route at a time. Patterns must start with /v1/.
										</div>
									</div>
									<Button variant="secondary" size="sm" onClick={addRule}>
										<Plus className="size-3.5" />
										Add rule
									</Button>
								</div>
								<div className="flex flex-col gap-2">
									{rules.length === 0 ? (
										<div className="text-xs text-tertiary-foreground">
											No endpoints blocked.
										</div>
									) : (
										rules.map((rule, index) => (
											<div
												key={`${rule.method}-${index}`}
												className="grid grid-cols-[120px_1fr_auto] gap-2"
											>
												<select
													className="h-8 rounded-md border border-input bg-input px-2 text-sm"
													value={rule.method}
													onChange={(e) =>
														updateRule(index, {
															method: e.target
																.value as RequestBlockRule["method"],
														})
													}
												>
													{METHODS.map((m) => (
														<option key={m} value={m}>
															{m}
														</option>
													))}
												</select>
												<Input
													value={rule.pattern}
													onChange={(e) =>
														updateRule(index, { pattern: e.target.value })
													}
													placeholder="/v1/customers/:customer_id"
												/>
												<Button
													variant="secondary"
													size="sm"
													onClick={() => removeRule(index)}
												>
													<Trash2 className="size-3.5" />
												</Button>
											</div>
										))
									)}
								</div>
							</div>

							{/* Config health */}
							<div className="flex flex-col gap-3 rounded-lg border border-border p-3 text-xs text-tertiary-foreground">
								<div className="flex flex-wrap items-center gap-2">
									<Badge
										variant="muted"
										className={cn(
											status?.configHealthy
												? "border-emerald-200 bg-emerald-50 text-emerald-700"
												: "border-amber-200 bg-amber-50 text-amber-700",
										)}
									>
										{status?.configHealthy
											? "Config healthy"
											: "Config unavailable"}
									</Badge>
									{status?.lastSuccessAt && (
										<span className="tabular-nums">
											Last refresh:{" "}
											{new Date(status.lastSuccessAt).toLocaleString()}
										</span>
									)}
								</div>
								<p className="text-pretty">
									{status?.configConfigured === false
										? "S3 request block config is not set up, so nothing is blocked."
										: status?.error ||
											"Saving takes effect within 10 seconds. If refresh fails, nothing is blocked."}
								</p>
							</div>
						</div>

						{/* Right: Monaco */}
						<div className="flex flex-col gap-2">
							<div className="text-xs font-medium text-tertiary-foreground uppercase tracking-wide">
								Raw JSON
							</div>
							<div className="rounded-md border border-border overflow-hidden">
								<Editor
									height="380px"
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
								<p role="alert" className="text-xs text-destructive">
									{jsonError}
								</p>
							)}
						</div>
					</div>
				)}

				<DialogFooter>
					{step === "edit" && (
						<Button
							variant="secondary"
							size="sm"
							onClick={() => setStep("select-org")}
						>
							← Back
						</Button>
					)}
					<Button variant="secondary" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					{step === "edit" && (
						<Button
							variant="primary"
							onClick={handleSave}
							isLoading={saving}
							disabled={loading || !canSave}
						>
							Save
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
