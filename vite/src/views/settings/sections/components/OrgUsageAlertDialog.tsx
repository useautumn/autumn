import { type DbUsageAlert, type Feature, FeatureType } from "@autumn/shared";
import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/v2/buttons/Button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { FeatureSearchDropdown } from "@/components/v2/dropdowns/FeatureSearchDropdown";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";

type ThresholdType = DbUsageAlert["threshold_type"];

interface OrgUsageAlertDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	features: Feature[];
	initialAlert?: DbUsageAlert;
	onSubmit: (alert: DbUsageAlert) => Promise<void>;
	isSaving: boolean;
}

const isPercentageType = (type: ThresholdType) =>
	type === "usage_percentage" || type === "remaining_percentage";

export const OrgUsageAlertDialog = ({
	open,
	onOpenChange,
	features,
	initialAlert,
	onSubmit,
	isSaving,
}: OrgUsageAlertDialogProps) => {
	const isEdit = initialAlert !== undefined;
	const [draft, setDraft] = useState<DbUsageAlert>(
		initialAlert ?? {
			enabled: true,
			threshold: 0,
			threshold_type: "usage",
			feature_id: undefined,
			name: undefined,
		},
	);

	const nonArchivedFeatures = features.filter(
		(f) => !f.archived && f.type !== FeatureType.Boolean,
	);

	const updateDraft = (patch: Partial<DbUsageAlert>) =>
		setDraft((prev) => ({ ...prev, ...patch }));

	const handleSave = async () => {
		if (Number.isNaN(draft.threshold) || draft.threshold < 0) {
			toast.error("Please enter a valid threshold");
			return;
		}
		if (draft.threshold_type === "remaining_percentage" && draft.threshold > 100) {
			toast.error(
				"Remaining percentage threshold must be between 0 and 100",
			);
			return;
		}

		const cleaned: DbUsageAlert = {
			...draft,
			feature_id: draft.feature_id || undefined,
			name: draft.name?.trim() ? draft.name.trim() : undefined,
		};
		await onSubmit(cleaned);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>
						{isEdit ? "Edit org usage alert" : "Add org usage alert"}
					</DialogTitle>
				</DialogHeader>

				<div className="flex flex-col gap-4">
					<div>
						<FormLabel>Feature</FormLabel>
						<FeatureSearchDropdown
							features={nonArchivedFeatures}
							value={draft.feature_id ?? null}
							onSelect={(featureId) =>
								updateDraft({ feature_id: featureId || undefined })
							}
							placeholder="Optional — leave empty for all features"
						/>
					</div>

					<div className="flex items-center justify-between">
						<FormLabel className="mb-0">Enabled</FormLabel>
						<Switch
							checked={draft.enabled}
							onCheckedChange={(value) => updateDraft({ enabled: value })}
						/>
					</div>

					<div>
						<FormLabel>Name</FormLabel>
						<Input
							placeholder="Optional label for this alert"
							value={draft.name ?? ""}
							onChange={(e) => updateDraft({ name: e.target.value })}
						/>
					</div>

					<div>
						<FormLabel>Threshold type</FormLabel>
						<Select
							value={draft.threshold_type}
							onValueChange={(value) =>
								updateDraft({ threshold_type: value as ThresholdType })
							}
						>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="usage">Usage (absolute value)</SelectItem>
								<SelectItem value="usage_percentage">
									Percentage used of allowance
								</SelectItem>
								<SelectItem value="remaining">
									Remaining (absolute value)
								</SelectItem>
								<SelectItem value="remaining_percentage">
									Percentage remaining of allowance
								</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<div>
						<FormLabel>
							Threshold
							{isPercentageType(draft.threshold_type) ? " (%)" : ""}
						</FormLabel>
						<Input
							type="number"
							placeholder={
								isPercentageType(draft.threshold_type) ? "eg, 80" : "eg, 1000"
							}
							value={Number.isFinite(draft.threshold) ? draft.threshold : ""}
							onChange={(e) =>
								updateDraft({
									threshold: Number.parseFloat(e.target.value),
								})
							}
						/>
					</div>
				</div>

				<DialogFooter>
					<Button
						variant="secondary"
						onClick={() => onOpenChange(false)}
						disabled={isSaving}
					>
						Cancel
					</Button>
					<Button variant="primary" onClick={handleSave} isLoading={isSaving}>
						{isEdit ? "Save" : "Add"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
