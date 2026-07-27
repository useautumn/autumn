import {
	Badge,
	Button,
	DialogFooter,
	Separator,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@autumn/ui";
import Editor from "@monaco-editor/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import {
	RAW_REQUEST_BLOCK_QUERY_KEY,
	type RequestBlockFullConfig,
	stripConfigStatusFields,
} from "./rawEdgeConfigTypes";

const parseJson = (text: string) => {
	try {
		return { value: JSON.parse(text) as unknown, error: null };
	} catch (error) {
		return {
			value: null,
			error: error instanceof Error ? error.message : "Invalid JSON",
		};
	}
};

export const RawEdgeConfigForm = ({
	config,
	onClose,
}: {
	config: RequestBlockFullConfig;
	onClose: () => void;
}) => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const initialJson = JSON.stringify(stripConfigStatusFields(config), null, 2);
	const [jsonText, setJsonText] = useState(initialJson);
	const [jsonError, setJsonError] = useState<string | null>(null);

	const mutation = useMutation({
		mutationFn: async (parsed: unknown) => {
			await axiosInstance.put("/admin/request-block-config", parsed);
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: RAW_REQUEST_BLOCK_QUERY_KEY,
			});
			toast.success("Request blocking config saved");
			onClose();
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to save config"));
		},
	});

	const handleJsonChange = (value: string | undefined) => {
		const text = value ?? "";
		setJsonText(text);
		setJsonError(parseJson(text).error);
	};

	const handleSave = async () => {
		const { value, error } = parseJson(jsonText);
		if (error) {
			setJsonError(error);
			toast.error("Fix the JSON error before saving");
			return;
		}
		await mutation.mutateAsync(value);
	};

	const orgEntries = Object.entries(config.orgs);
	const isDirty = jsonText !== initialJson;

	return (
		<>
			<div className="grid gap-6 md:grid-cols-2">
				<div className="flex flex-col gap-3">
					<div className="text-xs font-medium uppercase tracking-wide text-tertiary-foreground">
						Currently live
					</div>
					{orgEntries.length === 0 ? (
						<p className="text-xs text-tertiary-foreground">
							No orgs are blocked right now.
						</p>
					) : (
						<div className="overflow-hidden rounded-lg border border-border">
							<Table className="text-xs">
								<TableHeader>
									<TableRow>
										<TableHead>Org ID</TableHead>
										<TableHead>Blocks all</TableHead>
										<TableHead>Rules</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{orgEntries.map(([orgId, entry]) => (
										<TableRow key={orgId}>
											<TableCell className="max-w-[140px] truncate font-mono text-foreground">
												{orgId}
											</TableCell>
											<TableCell className="text-muted-foreground">
												{entry.blockAll ? "Yes" : "No"}
											</TableCell>
											<TableCell className="tabular-nums text-muted-foreground">
												{entry.blockedEndpoints.length}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}

					<div className="flex flex-col gap-3 text-xs text-tertiary-foreground">
						<Separator />
						<div className="flex flex-wrap items-center gap-2">
							<Badge variant="muted">
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
								? "S3 config is missing, so nothing is blocked."
								: config.error ||
									"Saving replaces the whole file and reaches every server within 10 seconds."}
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
					{jsonError ? (
						<p role="alert" className="text-pretty text-xs text-destructive">
							Invalid JSON: {jsonError}
						</p>
					) : (
						<p className="text-xs text-tertiary-foreground">
							Every org lives in this one file. Anything you delete here stops
							being blocked.
						</p>
					)}
				</div>
			</div>

			<DialogFooter className="flex-wrap pt-2">
				{mutation.error && (
					<span role="alert" className="mr-auto text-xs text-destructive">
						{getBackendErr(mutation.error, "Failed to save config")}
					</span>
				)}
				<Button variant="secondary" onClick={onClose}>
					Cancel
				</Button>
				<Button
					variant="primary"
					onClick={handleSave}
					isLoading={mutation.isPending}
					disabled={!isDirty || !!jsonError || mutation.isPending}
				>
					Save
				</Button>
			</DialogFooter>
		</>
	);
};
