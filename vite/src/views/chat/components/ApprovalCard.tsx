import { Button, Switch } from "@autumn/ui";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import type { DecidingState, LeafApprovalData } from "../chatTypes";
import { CatalogPreviewCard } from "./CatalogPreviewCard";

const approvalSummary = (approval: LeafApprovalData): string => {
	const plans = approval.preview?.plans ?? [];
	const versioned = plans.filter((plan) => plan.will_version).length;
	const planLabel = `${plans.length} plan${plans.length === 1 ? "" : "s"}`;
	const versionNote =
		versioned > 0
			? ` · ${versioned} create${versioned === 1 ? "s" : ""} a new version`
			: "";
	return `Apply changes to ${planLabel}${versionNote}?`;
};

/** The plan-write approval, rendered inline in the thread. The card stays put
 * after a decision — pending shows Apply/Discard, resolved shows the outcome.
 * A toggle switches the preview between the card view and raw JSON. */
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
	const { approvalId, preview, status } = approval;
	const [showJson, setShowJson] = useState(false);
	const resolving = deciding?.approvalId === approvalId;
	return (
		<div className="flex flex-col gap-3 rounded-md border border-border bg-secondary/40 p-3 text-sm">
			<div className="flex items-center justify-between gap-2">
				<span className="font-medium text-foreground">
					{approvalSummary(approval)}
				</span>
				{preview && (
					<label className="flex cursor-pointer items-center gap-1.5 text-tertiary-foreground text-xs">
						JSON
						<Switch
							checked={showJson}
							onCheckedChange={(checked) => setShowJson(checked)}
						/>
					</label>
				)}
			</div>
			{preview &&
				(showJson ? (
					<pre className="max-h-72 overflow-auto rounded-md border border-border bg-background p-2 text-[11px] text-tertiary-foreground">
						{JSON.stringify(preview, null, 2)}
					</pre>
				) : (
					<CatalogPreviewCard preview={preview} />
				))}
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
								variant="primary"
								size="sm"
								disabled={Boolean(deciding)}
								onClick={() => onApprove(approvalId)}
							>
								Apply
							</Button>
							<Button
								variant="secondary"
								size="sm"
								disabled={Boolean(deciding)}
								onClick={() => onReject(approvalId)}
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
