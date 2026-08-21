import type { ApprovalStepOutcome } from "@autumn/shared";
import { Button } from "@autumn/ui";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useApprovalDetailQuery } from "../hooks/useApprovalDetailQuery";
import { approvalSeedFromSheetData } from "../utils/approvalSheetIntegration";

const STATUS_LINES: Record<string, string> = {
	approved: "This approval was already applied.",
	cancelled: "This approval was dismissed — applying here runs a new action.",
	expired: "This approval expired — applying here runs a new action.",
	failed: "This approval failed — applying here runs a new action.",
};

/** Shown at the top of a sheet opened from a Slack approval deep link: the
 * primary CTA applies the EXACT approved request via the deterministic
 * executor; the sheet's own footer applies an edited version instead. */
export function ApprovalSheetBanner() {
	const sheetData = useSheetStore((state) => state.data);
	const { closeSheet } = useSheetStore();
	const axiosInstance = useAxiosInstance();
	const seed = approvalSeedFromSheetData(sheetData);
	const { approval, refetchApproval } = useApprovalDetailQuery({
		approvalId: seed?.approvalId ?? null,
	});
	const [applied, setApplied] = useState(false);

	const applyMutation = useMutation({
		mutationFn: async () => {
			const { data } = await axiosInstance.post<{
				applied: boolean;
				code?: string;
				message?: string;
				steps?: ApprovalStepOutcome[];
			}>(`/agent/approvals/${seed?.approvalId}/apply`);
			return data;
		},
		onError: () => {
			toast.error("Could not apply the approval — it may already be decided.");
			void refetchApproval();
		},
		onSuccess: (result) => {
			if (result.applied) {
				setApplied(true);
				toast.success("Approved change applied — the Slack card is updated.");
				closeSheet();
				return;
			}
			toast.error(
				result.code === "drifted"
					? (result.message ?? "Prices changed — review and apply again.")
					: (result.message ?? "The approval could not be applied."),
			);
			void refetchApproval();
		},
	});

	if (!seed?.approvalId || !approval || applied) return null;

	if (!approval.can_apply) {
		const line = STATUS_LINES[approval.status];
		return line ? (
			<div className="mx-4 mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
				{line}
			</div>
		) : null;
	}

	const minutesLeft = Math.max(
		0,
		Math.round((approval.expires_at - Date.now()) / 60_000),
	);
	const notes = [
		seed.prefillFailed &&
			'Couldn\'t prefill the form from the approval — "Apply approved change" still applies the exact approved request.',
		seed.unmappedRequestKeys.includes("billing_controls") &&
			'Includes billing controls not shown in this form — they apply only with "Apply approved change".',
	].filter((note): note is string => typeof note === "string");
	return (
		<div className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2">
			<div className="text-sm text-muted-foreground">
				From a Slack approval — expires in ~{minutesLeft}m. Applying here
				resolves the Slack card; editing first applies your version instead.
				{notes.map((note) => (
					<span className="mt-1 block text-warning" key={note}>
						{note}
					</span>
				))}
			</div>
			<Button
				disabled={applyMutation.isPending}
				onClick={() => applyMutation.mutate()}
				size="sm"
			>
				{applyMutation.isPending ? "Applying…" : "Apply approved change"}
			</Button>
		</div>
	);
}
