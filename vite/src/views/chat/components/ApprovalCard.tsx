import { Button, IconTooltipButton } from "@autumn/ui";
import {
	BracketsSquareIcon,
	SlidersHorizontalIcon,
} from "@phosphor-icons/react";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import type { DecidingState } from "../chatTypes";
import { isBillingPreview, type LeafApprovalData } from "../chatTypes";
import { BillingPreviewCard } from "./BillingPreviewCard";
import { CatalogPreviewCard } from "./CatalogPreviewCard";
import { JsonSheet } from "./JsonSheet";
import { ParamsSheet } from "./ParamsSheet";

const approvalSummary = (approval: LeafApprovalData): string => {
	const { preview } = approval;
	if (isBillingPreview(preview)) return "Apply this billing change?";
	const plans = preview?.plans ?? [];
	const planLabel = `${plans.length} plan${plans.length === 1 ? "" : "s"}`;
	return `Apply changes to ${planLabel}?`;
};

/** The plan-write approval, rendered inline in the thread. The card stays put
 * after a decision — pending shows Apply/Discard, resolved shows the outcome.
 * Icon buttons open the summary, params, and raw JSON in sheets. */
export function ApprovalCard({
	approval,
	onApprove,
	onReject,
	deciding,
}: {
	approval: LeafApprovalData;
	onApprove: (approvalId: string) => void;
	onReject: (approvalId: string) => void;
	deciding: DecidingState;
}) {
	const { approvalId, params, preview, status, toolName } = approval;
	const [paramsOpen, setParamsOpen] = useState(false);
	const [jsonOpen, setJsonOpen] = useState(false);
	const resolving = deciding?.approvalId === approvalId;
	return (
		<div className="flex w-fit max-w-full flex-col gap-3 rounded-md border border-border bg-secondary/40 p-3 text-sm">
			<div className="flex items-center justify-between gap-2">
				<span className="font-medium text-foreground">
					{approvalSummary(approval)}
				</span>
				<div className="flex items-center gap-1">
					{params && (
						<IconTooltipButton
							icon={<SlidersHorizontalIcon size={14} />}
							onClick={() => setParamsOpen(true)}
							tooltip="View parameters"
						/>
					)}
					{preview && (
						<IconTooltipButton
							icon={<BracketsSquareIcon size={14} />}
							onClick={() => setJsonOpen(true)}
							tooltip="View raw JSON"
						/>
					)}
				</div>
			</div>

			{preview &&
				(isBillingPreview(preview) ? (
					<BillingPreviewCard params={params} preview={preview} />
				) : (
					<CatalogPreviewCard preview={preview} />
				))}

			{params && (
				<ParamsSheet
					onOpenChange={setParamsOpen}
					open={paramsOpen}
					params={params}
					toolName={toolName}
				/>
			)}
			{preview && (
				<JsonSheet
					onOpenChange={setJsonOpen}
					open={jsonOpen}
					title="Raw JSON"
					value={preview}
				/>
			)}

			{(() => {
				if (resolving) {
					return (
						<span className="flex items-center gap-2 text-tertiary-foreground text-xs">
							<Loader2 className="size-3.5 animate-spin" />
							{deciding?.action === "approve" ? "Applying…" : "Discarding…"}
						</span>
					);
				}
				if (status === "pending") {
					return (
						<div className="flex gap-2 pt-1">
							<Button
								disabled={Boolean(deciding)}
								onClick={() => onApprove(approvalId)}
								size="sm"
								variant="primary"
							>
								Apply
							</Button>
							<Button
								disabled={Boolean(deciding)}
								onClick={() => onReject(approvalId)}
								size="sm"
								variant="secondary"
							>
								Discard
							</Button>
						</div>
					);
				}
				return (
					<span className="text-tertiary-foreground text-xs">
						{status === "approved" ? "Applied" : "Discarded"}
					</span>
				);
			})()}
		</div>
	);
}
