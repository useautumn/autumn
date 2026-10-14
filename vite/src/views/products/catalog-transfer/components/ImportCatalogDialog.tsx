import type {
	PreviewUpdateCatalogResponse,
	UpdateCatalogParamsInput,
} from "@autumn/shared";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@autumn/ui";
import { CaretRightIcon } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useOrg } from "@/hooks/common/useOrg";
import { useUpdateCatalogMutation } from "@/hooks/queries/catalog/useUpdateCatalogMutation";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { cn } from "@/lib/utils";
import { CatalogV2Service } from "@/services/CatalogV2Service";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { getBackendErr } from "@/utils/genUtils";
import { featuresForImportPreview } from "../utils/featuresForImportPreview";
import { buildImportPreviewRows } from "../utils/importPreviewRows";
import { isCatalogImportBlocked } from "../utils/isCatalogImportBlocked";
import { parseCatalogImportJson } from "../utils/parseCatalogImportJson";
import { CatalogJsonEditor } from "./CatalogJsonEditor";
import { CatalogOrgRow } from "./CatalogOrgRow";
import {
	ImportBlockedBanner,
	ImportCatalogFooter,
} from "./ImportCatalogFooter";
import { ImportPreviewList } from "./import-preview/ImportPreviewList";

const PLACEHOLDER =
	'Paste the JSON from Export catalog: { "features": [...], "plans": [...] }';

type CatalogImportPreview = {
	params: UpdateCatalogParamsInput;
	result: PreviewUpdateCatalogResponse;
};

const jsonSummary = ({
	params,
	text,
}: {
	params: UpdateCatalogParamsInput;
	text: string;
}) =>
	[
		`${params.features?.length ?? 0} features`,
		`${params.plans?.length ?? 0} plans`,
		`${text.split("\n").length.toLocaleString()} lines`,
	].join(" · ");

function EditJsonToggle({
	open,
	summary,
	onToggle,
}: {
	open: boolean;
	summary: string;
	onToggle: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onToggle}
			aria-expanded={open}
			className="flex h-[34px] w-full shrink-0 cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-input-background px-3 text-left hover:bg-overlay-hover"
		>
			<CaretRightIcon
				size={11}
				className={cn(
					"text-tertiary-foreground transition-transform",
					open && "rotate-90",
				)}
			/>
			<span className="text-foreground text-sm">Edit JSON</span>
			<span className="truncate font-mono text-tertiary-foreground text-xs">
				{summary}
			</span>
			<span className="ml-auto shrink-0 text-tertiary-foreground text-xs">
				Editing clears the preview
			</span>
		</button>
	);
}

export function ImportCatalogDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const axiosInstance = useAxiosInstance();
	const env = useEnv();
	const { org } = useOrg();
	const { features } = useFeaturesQuery();
	const updateCatalog = useUpdateCatalogMutation();
	const blocked = isCatalogImportBlocked({
		hostname: window.location.hostname,
	});

	const [text, setText] = useState("");
	const [preview, setPreview] = useState<CatalogImportPreview | null>(null);
	const [jsonOpen, setJsonOpen] = useState(false);
	const parsed = useMemo(() => parseCatalogImportJson({ text }), [text]);

	const previewMutation = useMutation({
		mutationFn: (params: UpdateCatalogParamsInput) =>
			CatalogV2Service.previewUpdate(axiosInstance, params),
		onSuccess: (result, params) => {
			setPreview({ params, result });
			setJsonOpen(false);
		},
	});

	const rows = useMemo(
		() =>
			preview
				? buildImportPreviewRows({
						preview: preview.result,
						request: preview.params,
					})
				: [],
		[preview],
	);

	const previewFeatures = useMemo(
		() =>
			preview
				? featuresForImportPreview({
						orgFeatures: features,
						request: preview.params,
					})
				: features,
		[features, preview],
	);

	const reset = () => {
		setText("");
		setPreview(null);
		setJsonOpen(false);
		previewMutation.reset();
		updateCatalog.reset();
	};

	const handleOpenChange = (next: boolean) => {
		if (!next) reset();
		onOpenChange(next);
	};

	const editText = (next: string) => {
		setText(next);
		setPreview(null);
		previewMutation.reset();
	};

	const runPreview = () => {
		if ("params" in parsed) previewMutation.mutate(parsed.params);
	};

	const apply = async () => {
		if (!preview) return;
		try {
			await updateCatalog.mutateAsync(preview.params);
			toast.success("Catalog imported");
			handleOpenChange(false);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to import the catalog"));
		}
	};

	const error =
		"error" in parsed
			? parsed.error
			: previewMutation.error
				? getBackendErr(previewMutation.error, "Preview failed")
				: null;

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent
				className={cn(
					"flex max-h-[calc(100vh-2rem)] max-w-[768px] flex-col",
					preview && "h-[820px]",
				)}
			>
				<DialogHeader>
					<DialogTitle>Import catalog</DialogTitle>
					<DialogDescription>
						Paste JSON from Export catalog. Preview shows what will change in
						this org before anything is written.
					</DialogDescription>
				</DialogHeader>

				{blocked && <ImportBlockedBanner />}

				<CatalogOrgRow
					label="Target"
					orgName={org?.name ?? ""}
					detail={window.location.host}
					env={env}
					muted={blocked}
				/>

				{preview && (
					<EditJsonToggle
						open={jsonOpen}
						summary={jsonSummary({ params: preview.params, text })}
						onToggle={() => setJsonOpen((current) => !current)}
					/>
				)}

				{(!preview || jsonOpen) && (
					<CatalogJsonEditor
						value={text}
						onChange={editText}
						disabled={blocked}
						height={preview ? "200px" : "420px"}
						placeholder={PLACEHOLDER}
						className="shrink-0"
					/>
				)}

				{preview && (
					<ImportPreviewList features={previewFeatures} rows={rows} />
				)}

				<ImportCatalogFooter
					blocked={blocked}
					error={error}
					hasPreview={preview !== null}
					canPreview={"params" in parsed}
					isPreviewing={previewMutation.isPending}
					isApplying={updateCatalog.isPending}
					onCancel={() => handleOpenChange(false)}
					onPreview={runPreview}
					onApply={apply}
				/>
			</DialogContent>
		</Dialog>
	);
}
