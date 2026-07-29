import { Badge, Button, DialogFooter, Input } from "@autumn/ui";
import Editor from "@monaco-editor/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import {
	buildEditableJsonText,
	RATE_LIMIT_REDIS_ALLOWLIST_QUERY_KEY,
	type RateLimitRedisAllowlistConfig,
} from "./rateLimitRedisAllowlistDialogState";

export const RateLimitRedisAllowlistForm = ({
	config: loadedConfig,
	onClose,
}: {
	config: RateLimitRedisAllowlistConfig;
	onClose: () => void;
}) => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const [config, setConfig] =
		useState<RateLimitRedisAllowlistConfig>(loadedConfig);
	const [jsonText, setJsonText] = useState(() =>
		buildEditableJsonText({ config: loadedConfig }),
	);
	const [jsonError, setJsonError] = useState<string | null>(null);
	const [syncSource, setSyncSource] = useState<"form" | "json">("form");
	const [newCustomerId, setNewCustomerId] = useState("");

	const mutation = useMutation({
		mutationFn: async (payload: unknown) => {
			await axiosInstance.put(
				"/admin/rate-limit-redis-allowlist-config",
				payload,
			);
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: RATE_LIMIT_REDIS_ALLOWLIST_QUERY_KEY,
			});
			toast.success("Rate limit Redis allowlist saved");
			onClose();
		},
		onError: (error) => {
			toast.error(
				getBackendErr(error, "Failed to save rate limit Redis allowlist"),
			);
		},
	});

	// Mirrors form edits into the JSON buffer; the buffer is what gets saved.
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

		await mutation.mutateAsync(payload);
	};

	return (
		<>
			<div className="grid grid-cols-[360px_1fr] gap-6">
				<div className="flex flex-col gap-4">
					<div className="text-xs font-medium uppercase tracking-wide text-tertiary-foreground">
						Allowlisted Customers
					</div>

					<div className="rounded-lg border border-border p-3">
						<div className="mb-3 flex flex-col gap-2">
							<Input
								aria-label="Customer ID"
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
									No customers allowlisted. Every limit is counted per server.
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

					<div className="flex flex-col gap-3 rounded-lg border border-border p-3 text-xs text-tertiary-foreground">
						<div className="flex flex-wrap items-center gap-2">
							<Badge
								variant="muted"
								className={cn(
									config.configHealthy
										? "border-emerald-200 bg-emerald-50 text-emerald-700"
										: "border-amber-200 bg-amber-50 text-amber-700",
								)}
							>
								{config.configHealthy ? "Config healthy" : "Config unavailable"}
							</Badge>
							{config.lastSuccessAt && (
								<span className="tabular-nums">
									Last refresh:{" "}
									{new Date(config.lastSuccessAt).toLocaleString()}
								</span>
							)}
						</div>
						<p className="text-pretty">
							{config.configConfigured === false
								? "S3 Redis allowlist config is not set up, so every limit is counted per server."
								: config.error ||
									"Saving takes effect within 10 seconds. If refresh fails, limits are counted per server."}
						</p>
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
						<p role="alert" className="text-xs text-destructive">
							{jsonError}
						</p>
					)}
				</div>
			</div>

			<DialogFooter>
				<Button variant="secondary" onClick={onClose}>
					Cancel
				</Button>
				<Button
					variant="primary"
					onClick={handleSave}
					isLoading={mutation.isPending}
					disabled={jsonError !== null}
				>
					Save
				</Button>
			</DialogFooter>
		</>
	);
};
