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
import {
	buildEditableJsonText,
	DEFAULT_CONFIG,
	isSaveDisabled,
	loadAllowlistConfig,
	type RateLimitRedisAllowlistConfig,
} from "./rateLimitRedisAllowlistDialogState";

export function RateLimitRedisAllowlistDialog({
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
		useState<RateLimitRedisAllowlistConfig>(DEFAULT_CONFIG);
	const [jsonText, setJsonText] = useState("");
	const [jsonError, setJsonError] = useState<string | null>(null);
	const [syncSource, setSyncSource] = useState<"form" | "json">("form");
	const [newCustomerId, setNewCustomerId] = useState("");
	const [loadFailed, setLoadFailed] = useState(false);

	useEffect(() => {
		if (!open) return;

		let cancelled = false;

		void loadAllowlistConfig({
			axiosGet: () =>
				axiosInstance.get<RateLimitRedisAllowlistConfig>(
					"/admin/rate-limit-redis-allowlist-config",
				),
			isCancelled: () => cancelled,
			applyInitialReset: (update) => {
				setLoading(update.loading);
				setLoadFailed(update.loadFailed);
				setConfig(update.config);
				setJsonText(update.jsonText);
				setJsonError(update.jsonError);
				setSyncSource(update.syncSource);
			},
			applySuccess: (update) => {
				setConfig(update.config);
				setJsonText(update.jsonText);
				setJsonError(update.jsonError);
				setSyncSource(update.syncSource);
				setLoading(update.loading);
			},
			applyFailure: (update) => {
				setLoadFailed(update.loadFailed);
				setLoading(update.loading);
			},
			onError: (error) =>
				toast.error(
					getBackendErr(error, "Failed to load rate limit redis allowlist"),
				),
		});

		return () => {
			cancelled = true;
		};
	}, [axiosInstance, open]);

	useEffect(() => {
		if (syncSource !== "form") return;
		setJsonText(buildEditableJsonText({ config }));
		setJsonError(null);
	}, [config, syncSource]);

	const sortedCustomerIds = useMemo(
		() => [...config.customerIds].sort((a, b) => a.localeCompare(b)),
		[config.customerIds],
	);

	const handleJsonChange = (value: string | undefined) => {
		const text = value ?? "";
		setJsonText(text);
		setSyncSource("json");

		try {
			const parsed = JSON.parse(text) as { customerIds?: unknown };
			if (!Array.isArray(parsed.customerIds)) {
				setJsonError("customerIds must be an array of strings");
				return;
			}
			const customerIds: string[] = [];
			for (const id of parsed.customerIds) {
				if (typeof id !== "string" || id.trim().length === 0) {
					setJsonError("customerIds entries must be non-empty strings");
					return;
				}
				customerIds.push(id.trim());
			}
			setConfig((current) => ({ ...current, customerIds }));
			setJsonError(null);
		} catch {
			setJsonError("Invalid JSON");
		}
	};

	const addCustomerId = () => {
		const customerId = newCustomerId.trim();
		if (!customerId) return;
		if (config.customerIds.includes(customerId)) {
			toast.error(`${customerId} is already in the allowlist`);
			return;
		}

		setSyncSource("form");
		setConfig((current) => ({
			...current,
			customerIds: [...current.customerIds, customerId],
		}));
		setNewCustomerId("");
	};

	const removeCustomerId = ({ customerId }: { customerId: string }) => {
		setSyncSource("form");
		setConfig((current) => ({
			...current,
			customerIds: current.customerIds.filter((id) => id !== customerId),
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
			await axiosInstance.put(
				"/admin/rate-limit-redis-allowlist-config",
				payload,
			);
			toast.success("Rate limit Redis allowlist saved");
			onOpenChange(false);
		} catch (error) {
			toast.error(
				getBackendErr(error, "Failed to save rate limit Redis allowlist"),
			);
		} finally {
			setSaving(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-5xl bg-card">
				<DialogHeader>
					<DialogTitle>Rate Limit Redis Allowlist</DialogTitle>
					<DialogDescription>
						Customers in this list have their Track and Check rate limits
						enforced via Redis (strict global counter across all server tasks)
						instead of the default in-memory per-task counter. Use for
						high-volume customers where you want exact rate-limit enforcement
						rather than the leaky per-task aggregation.
					</DialogDescription>
				</DialogHeader>

				{loading ? (
					<div className="py-8 text-center text-sm text-tertiary-foreground">
						Loading...
					</div>
				) : (
					<div className="grid grid-cols-[360px_1fr] gap-6">
						<div className="flex flex-col gap-4">
							<div className="text-xs font-medium uppercase tracking-wide text-tertiary-foreground">
								Allowlisted Customers
							</div>

							<div className="rounded-lg border border-border p-3">
								<div className="mb-3 flex flex-col gap-2">
									<Input
										placeholder="Customer ID (e.g. cus_hatchet_main)"
										value={newCustomerId}
										onChange={(event) => setNewCustomerId(event.target.value)}
										onKeyDown={(event) => {
											if (event.key === "Enter") {
												event.preventDefault();
												addCustomerId();
											}
										}}
									/>
									<Button
										variant="secondary"
										size="sm"
										onClick={addCustomerId}
										disabled={!newCustomerId.trim()}
									>
										Add customer
									</Button>
								</div>

								<div className="flex flex-col gap-2 border-t border-border pt-3">
									{sortedCustomerIds.length === 0 ? (
										<div className="text-xs italic text-tertiary-foreground">
											No customers on the allowlist. All Track and Check rate
											limits use the in-memory counter.
										</div>
									) : (
										sortedCustomerIds.map((customerId) => (
											<div
												key={customerId}
												className="flex items-start justify-between gap-3 rounded-lg border border-border p-2"
											>
												<div className="min-w-0 flex-1">
													<div className="truncate font-mono text-xs text-foreground">
														{customerId}
													</div>
												</div>
												<Button
													variant="secondary"
													size="sm"
													onClick={() => removeCustomerId({ customerId })}
												>
													Remove
												</Button>
											</div>
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
										? "S3 rate-limit Redis allowlist config is not configured."
										: config.error ||
											"Changes take effect on the next request after polling refresh (10s)."}
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

				<DialogFooter>
					<Button variant="secondary" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						variant="primary"
						onClick={handleSave}
						isLoading={saving}
						disabled={isSaveDisabled({ loading, loadFailed, jsonError })}
					>
						Save
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
