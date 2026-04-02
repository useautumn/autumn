import Editor from "@monaco-editor/react";
import { useEffect, useState } from "react";
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
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

type OrgEntry = {
	blockAll: boolean;
	blockedEndpoints: { method: string; pattern: string }[];
	updatedAt: string;
	updatedBy?: string;
};

type FullConfig = {
	orgs: Record<string, OrgEntry>;
	configHealthy: boolean;
	configConfigured: boolean;
	lastSuccessAt: string | null;
	error: string | null;
};

export function RawEdgeConfigDialog({
	open,
	onOpenChange,
	configId,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	configId: "request-block";
}) {
	const axiosInstance = useAxiosInstance();
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [fullConfig, setFullConfig] = useState<FullConfig | null>(null);
	const [jsonText, setJsonText] = useState("");
	const [jsonError, setJsonError] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;

		let cancelled = false;
		setLoading(true);

		void axiosInstance
			.get<FullConfig>("/admin/request-block-config")
			.then(({ data }) => {
				if (cancelled) return;
				setFullConfig(data);
				const {
					configHealthy: _h,
					configConfigured: _c,
					lastSuccessAt: _l,
					error: _e,
					...configData
				} = data;
				setJsonText(JSON.stringify(configData, null, 2));
			})
			.catch((error) => {
				if (!cancelled) {
					toast.error(getBackendErr(error, "Failed to load config"));
				}
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [axiosInstance, open, configId]);

	const handleJsonChange = (value: string | undefined) => {
		const text = value ?? "";
		setJsonText(text);
		try {
			JSON.parse(text);
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

		let parsed: unknown;
		try {
			parsed = JSON.parse(jsonText);
		} catch {
			toast.error("Invalid JSON");
			return;
		}

		setSaving(true);
		try {
			await axiosInstance.put("/admin/request-block-config", parsed);
			toast.success("Config saved");
			onOpenChange(false);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to save config"));
		} finally {
			setSaving(false);
		}
	};

	const orgEntries = fullConfig ? Object.entries(fullConfig.orgs) : [];

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-5xl bg-card">
				<DialogHeader>
					<DialogTitle>Raw Config — Request Blocking</DialogTitle>
					<DialogDescription>
						Edit the full S3 config file. This affects all organizations.
					</DialogDescription>
				</DialogHeader>

				{loading ? (
					<div className="py-8 text-sm text-t3 text-center">Loading...</div>
				) : (
					<div className="grid grid-cols-2 gap-6">
						{/* Left: summary */}
						<div className="flex flex-col gap-3">
							<div className="text-xs font-medium text-t3 uppercase tracking-wide">
								Config Summary
							</div>
							<div className="flex items-center gap-2">
								<Badge
									variant="muted"
									className={
										fullConfig?.configHealthy
											? "bg-emerald-50 text-emerald-700 border-emerald-200"
											: "bg-amber-50 text-amber-700 border-amber-200"
									}
								>
									{fullConfig?.configHealthy ? "Healthy" : "Unavailable"}
								</Badge>
								{fullConfig?.lastSuccessAt && (
									<span className="text-xs text-t3">
										Last refresh:{" "}
										{new Date(fullConfig.lastSuccessAt).toLocaleString()}
									</span>
								)}
							</div>
							{orgEntries.length === 0 ? (
								<div className="text-xs text-t3">No orgs configured.</div>
							) : (
								<div className="rounded-lg border border-border overflow-hidden">
									<table className="w-full text-xs">
										<thead>
											<tr className="border-b border-border">
												<th className="text-left px-3 py-2 font-medium text-t2">
													Org ID
												</th>
												<th className="text-left px-3 py-2 font-medium text-t2">
													Block All
												</th>
												<th className="text-left px-3 py-2 font-medium text-t2">
													Rules
												</th>
											</tr>
										</thead>
										<tbody>
											{orgEntries.map(([oid, entry]) => (
												<tr
													key={oid}
													className="border-b border-border last:border-b-0"
												>
													<td className="px-3 py-2 font-mono truncate max-w-[120px] text-t1">
														{oid}
													</td>
													<td className="px-3 py-2 text-t2">
														{entry.blockAll ? "Yes" : "No"}
													</td>
													<td className="px-3 py-2 text-t2">
														{entry.blockedEndpoints.length}
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							)}
							{fullConfig?.error && (
								<div className="text-xs text-red-500">{fullConfig.error}</div>
							)}
						</div>

						{/* Right: Monaco */}
						<div className="flex flex-col gap-2">
							<div className="text-xs font-medium text-t3 uppercase tracking-wide">
								Raw JSON
							</div>
							<div className="rounded-md border border-border overflow-hidden">
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
