import { Badge, Button, DialogFooter, Input, Separator } from "@autumn/ui";
import Editor from "@monaco-editor/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import {
	buildOrgAllowlistJsonText,
	type OrgAllowlistEdgeConfig,
} from "./orgAllowlistEdgeConfigTypes";

type EditorState = {
	config: OrgAllowlistEdgeConfig;
	jsonText: string;
	jsonError: string | null;
};

export const OrgAllowlistEdgeConfigForm = ({
	config: loadedConfig,
	onClose,
	endpoint,
	queryKey,
	successMessage,
	errorMessage,
	enabledDescription,
	emptyMessage,
	missingConfigMessage,
	healthyConfigMessage = "Saved changes reach all servers within 60 seconds.",
	orgPlaceholder = "Org ID",
}: {
	config: OrgAllowlistEdgeConfig;
	onClose: () => void;
	endpoint: string;
	queryKey: readonly unknown[];
	successMessage: string;
	errorMessage: string;
	enabledDescription: string;
	emptyMessage: string;
	missingConfigMessage: string;
	healthyConfigMessage?: string;
	orgPlaceholder?: string;
}) => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const [editor, setEditor] = useState<EditorState>(() => ({
		config: loadedConfig,
		jsonText: buildOrgAllowlistJsonText({ config: loadedConfig }),
		jsonError: null,
	}));
	const [newOrgId, setNewOrgId] = useState("");

	const mutation = useMutation({
		mutationFn: async (payload: unknown) => {
			await axiosInstance.put(endpoint, payload);
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey });
			toast.success(successMessage);
			onClose();
		},
		onError: (error) => {
			toast.error(getBackendErr(error, errorMessage));
		},
	});

	const updateEnabledOrgIds = ({
		update,
	}: {
		update: (current: string[]) => string[];
	}) => {
		setEditor((current) => {
			const config = {
				...current.config,
				enabledOrgIds: update(current.config.enabledOrgIds),
			};
			return {
				config,
				jsonText: buildOrgAllowlistJsonText({ config }),
				jsonError: null,
			};
		});
	};

	const handleJsonChange = (value: string | undefined) => {
		const jsonText = value ?? "";
		try {
			const parsed = JSON.parse(jsonText) as { enabledOrgIds?: unknown };
			const enabledOrgIds = parsed.enabledOrgIds ?? [];
			if (
				!Array.isArray(enabledOrgIds) ||
				!enabledOrgIds.every((orgId) => typeof orgId === "string")
			) {
				throw new Error("enabledOrgIds must be an array of strings");
			}
			setEditor((current) => ({
				config: {
					...current.config,
					enabledOrgIds,
				},
				jsonText,
				jsonError: null,
			}));
		} catch (error) {
			setEditor((current) => ({
				...current,
				jsonText,
				jsonError:
					error instanceof SyntaxError
						? "Invalid JSON"
						: error instanceof Error
							? error.message
							: "Invalid config",
			}));
		}
	};

	const addOrg = () => {
		const orgId = newOrgId.trim();
		if (!orgId) return;
		if (editor.config.enabledOrgIds.includes(orgId)) {
			toast.error("Org already in list");
			return;
		}

		updateEnabledOrgIds({
			update: (current) => [...current, orgId],
		});
		setNewOrgId("");
	};

	const removeOrg = ({ orgId }: { orgId: string }) => {
		updateEnabledOrgIds({
			update: (current) => current.filter((id) => id !== orgId),
		});
	};

	const handleSave = async () => {
		if (editor.jsonError) {
			toast.error("Fix JSON errors before saving");
			return;
		}

		let payload: unknown;
		try {
			payload = JSON.parse(editor.jsonText);
		} catch {
			toast.error("Invalid JSON");
			return;
		}

		await mutation.mutateAsync(payload);
	};

	const sortedOrgIds = [...editor.config.enabledOrgIds].sort();
	const statusMessage =
		editor.config.configConfigured === false
			? missingConfigMessage
			: (editor.config.error ?? healthyConfigMessage);

	return (
		<>
			<div className="grid gap-6 lg:grid-cols-[320px_1fr]">
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-1">
						<div className="text-xs font-medium uppercase text-tertiary-foreground">
							Enabled orgs
						</div>
						<div className="text-pretty text-xs text-tertiary-foreground">
							{enabledDescription}
						</div>
					</div>

					<div className="rounded-lg border border-border p-3">
						<div className="mb-3 flex gap-2">
							<Input
								placeholder={orgPlaceholder}
								aria-label={orgPlaceholder}
								value={newOrgId}
								onChange={(event) => setNewOrgId(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										event.preventDefault();
										addOrg();
									}
								}}
							/>
							<Button
								variant="secondary"
								size="sm"
								onClick={addOrg}
								disabled={!newOrgId.trim()}
							>
								Add
							</Button>
						</div>

						<div className="flex flex-col gap-2 border-t border-border pt-3">
							{sortedOrgIds.length === 0 && (
								<div className="text-pretty text-xs italic text-tertiary-foreground">
									{emptyMessage}
								</div>
							)}
							{sortedOrgIds.map((orgId) => (
								<div
									key={orgId}
									className="flex items-center justify-between gap-3 rounded-lg border border-border p-2"
								>
									<div className="truncate font-mono text-xs text-foreground">
										{orgId}
									</div>
									<Button
										variant="secondary"
										size="sm"
										onClick={() => removeOrg({ orgId })}
									>
										Remove
									</Button>
								</div>
							))}
						</div>
					</div>

					<div className="flex flex-col gap-3 text-xs text-tertiary-foreground">
						<Separator />
						<div className="flex flex-wrap items-center gap-2">
							<Badge variant="muted">
								{editor.config.configHealthy
									? "Config healthy"
									: "Config unavailable"}
							</Badge>
							{editor.config.lastSuccessAt && (
								<span className="tabular-nums">
									Last refresh:{" "}
									{new Date(editor.config.lastSuccessAt).toLocaleString()}
								</span>
							)}
						</div>
						<p className="text-pretty">{statusMessage}</p>
					</div>
				</div>

				<div className="flex flex-col gap-2">
					<div className="flex flex-col gap-1">
						<div className="text-xs font-medium uppercase text-tertiary-foreground">
							Raw JSON
						</div>
						<div className="text-pretty text-xs text-tertiary-foreground">
							Edits here and in the list stay in sync. This is what gets saved.
						</div>
					</div>
					<div className="overflow-hidden rounded-md border border-border">
						<Editor
							height="420px"
							language="json"
							value={editor.jsonText}
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
					{editor.jsonError && (
						<div role="alert" className="text-xs text-destructive">
							{editor.jsonError}
						</div>
					)}
				</div>
			</div>

			{mutation.isError && (
				<div role="alert" className="text-sm text-destructive">
					{getBackendErr(mutation.error, errorMessage)}
				</div>
			)}

			<DialogFooter>
				<Button variant="secondary" onClick={onClose}>
					Cancel
				</Button>
				<Button
					variant="primary"
					onClick={handleSave}
					isLoading={mutation.isPending}
					disabled={!!editor.jsonError}
				>
					Save
				</Button>
			</DialogFooter>
		</>
	);
};
