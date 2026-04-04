import { Plus, Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
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

export function RequestBlockDialog({
	open,
	onOpenChange,
	orgId,
	orgName,
	onSaved,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	orgId?: string;
	orgName?: string;
	onSaved: () => void | Promise<void>;
}) {
	const axiosInstance = useAxiosInstance();
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [blockAll, setBlockAll] = useState(false);
	const [rules, setRules] = useState<RequestBlockRule[]>([]);
	const [status, setStatus] = useState<RequestBlockResponse | null>(null);

	useEffect(() => {
		if (!open || !orgId) {
			return;
		}

		let cancelled = false;
		setLoading(true);

		void axiosInstance
			.get<RequestBlockResponse>(`/admin/orgs/${orgId}/request-block`)
			.then(({ data }) => {
				if (cancelled) return;
				setStatus(data);
				setBlockAll(data.blockAll);
				setRules(data.blockedEndpoints);
			})
			.catch((error) => {
				if (!cancelled) {
					toast.error(getBackendErr(error, "Failed to load request block state"));
				}
			})
			.finally(() => {
				if (!cancelled) {
					setLoading(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [axiosInstance, open, orgId]);

	const canSave = useMemo(
		() =>
			rules.every(
				(rule) => rule.pattern.trim().startsWith("/v1/") && rule.pattern.trim(),
			),
		[rules],
	);

	const updateRule = (
		index: number,
		next: Partial<RequestBlockRule>,
	) => {
		setRules((current) =>
			current.map((rule, ruleIndex) =>
				ruleIndex === index ? { ...rule, ...next } : rule,
			),
		);
	};

	const removeRule = (index: number) => {
		setRules((current) => current.filter((_, ruleIndex) => ruleIndex !== index));
	};

	const addRule = () => {
		setRules((current) => [...current, { method: "POST", pattern: "/v1/" }]);
	};

	const handleSave = async () => {
		if (!orgId) return;

		if (!canSave) {
			toast.error("Every blocked endpoint must start with /v1/");
			return;
		}

		setSaving(true);
		try {
			await axiosInstance.put(`/admin/orgs/${orgId}/request-block`, {
				blockAll,
				blockedEndpoints: rules.map((rule) => ({
					method: rule.method,
					pattern: rule.pattern.trim(),
				})),
			});
			toast.success("Updated request block settings");
			await onSaved();
			onOpenChange(false);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to save request block state"));
		} finally {
			setSaving(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl bg-card">
				<DialogHeader>
					<DialogTitle>Request blocking</DialogTitle>
					<DialogDescription>
						Manage `/v1` request blocking for {orgName || orgId}.
					</DialogDescription>
				</DialogHeader>

				{loading ? (
					<div className="text-sm text-t3">Loading request block state...</div>
				) : (
					<div className="flex flex-col gap-4">
						<div className="flex items-center justify-between rounded-lg border border-border p-3">
							<div className="flex flex-col gap-1">
								<div className="text-sm font-medium text-t1">
									Block all `/v1` requests
								</div>
								<div className="text-xs text-t3">
									Use this as the org-wide kill switch.
								</div>
							</div>
							<label className="flex items-center gap-2 text-sm text-t2">
								<input
									type="checkbox"
									checked={blockAll}
									onChange={(event) => setBlockAll(event.target.checked)}
								/>
								Enabled
							</label>
						</div>

						<div className="rounded-lg border border-border p-3">
							<div className="mb-3 flex items-center justify-between">
								<div>
									<div className="text-sm font-medium text-t1">
										Selective endpoint rules
									</div>
									<div className="text-xs text-t3">
										Method + pattern rules use exact route matching.
									</div>
								</div>
								<Button
									variant="secondary"
									size="sm"
									onClick={addRule}
								>
									<Plus className="size-3.5" />
									Add rule
								</Button>
							</div>

							<div className="flex flex-col gap-2">
								{rules.length === 0 ? (
									<div className="text-xs text-t3">
										No selective rules configured.
									</div>
								) : (
									rules.map((rule, index) => (
										<div key={`${rule.method}-${index}`} className="grid grid-cols-[120px_1fr_auto] gap-2">
											<select
												className="h-8 rounded-md border border-input bg-input px-2 text-sm"
												value={rule.method}
												onChange={(event) =>
													updateRule(index, {
														method: event.target
															.value as RequestBlockRule["method"],
													})
												}
											>
												{METHODS.map((method) => (
													<option key={method} value={method}>
														{method}
													</option>
												))}
											</select>
											<Input
												value={rule.pattern}
												onChange={(event) =>
													updateRule(index, {
														pattern: event.target.value,
													})
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

						<div className="rounded-lg border border-border p-3 text-xs text-t3">
							<div className="mb-2 flex items-center gap-2">
								<Badge
									variant="muted"
									className={
										status?.configHealthy
											? "bg-emerald-50 text-emerald-700 border-emerald-200"
											: "bg-amber-50 text-amber-700 border-amber-200"
									}
								>
									{status?.configHealthy ? "Config healthy" : "Config unavailable"}
								</Badge>
								{status?.lastSuccessAt && (
									<span>
										Last successful refresh:{" "}
										{new Date(status.lastSuccessAt).toLocaleString()}
									</span>
								)}
							</div>
							<div>
								{status?.configConfigured === false
									? "S3 request block config is not configured in the server environment."
									: status?.error || "When config refresh fails, blocking is disabled until the next successful refresh."}
							</div>
						</div>
					</div>
				)}

				<DialogFooter>
					<Button
						variant="secondary"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						variant="primary"
						onClick={handleSave}
						isLoading={saving}
						disabled={loading || !canSave}
					>
						Save
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
