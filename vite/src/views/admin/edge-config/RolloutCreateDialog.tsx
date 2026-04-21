import { useEffect, useState } from "react";
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

export const RolloutCreateDialog = ({
	open,
	onOpenChange,
	onSubmit,
	isSaving,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmit: ({
		rolloutId,
		percent,
	}: {
		rolloutId: string;
		percent: number;
	}) => void;
	isSaving: boolean;
}) => {
	const [rolloutId, setRolloutId] = useState("");
	const [percentInput, setPercentInput] = useState("0");

	useEffect(() => {
		if (open) return;
		setRolloutId("");
		setPercentInput("0");
	}, [open]);

	const percent = Number(percentInput);
	const isPercentValid =
		!Number.isNaN(percent) && percent >= 0 && percent <= 100;
	const trimmedRolloutId = rolloutId.trim();
	const canSubmit = trimmedRolloutId.length > 0 && isPercentValid;

	const handleSubmit = () => {
		if (!canSubmit) return;
		onSubmit({
			rolloutId: trimmedRolloutId,
			percent,
		});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>Create Rollout</DialogTitle>
					<DialogDescription>
						Add a new rollout entry and set its default global percentage.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<label className="text-xs font-medium text-t2" htmlFor="rollout-id">
							Rollout ID
						</label>
						<Input
							id="rollout-id"
							placeholder="v2-cache"
							value={rolloutId}
							onChange={(event) => setRolloutId(event.target.value)}
						/>
					</div>

					<div className="flex flex-col gap-2">
						<label
							className="text-xs font-medium text-t2"
							htmlFor="rollout-percent"
						>
							Global Percent
						</label>
						<Input
							id="rollout-percent"
							type="number"
							min={0}
							max={100}
							value={percentInput}
							onChange={(event) => setPercentInput(event.target.value)}
						/>
						{percentInput.length > 0 && !isPercentValid && (
							<p className="text-[11px] text-red-600">
								Enter a percentage between 0 and 100.
							</p>
						)}
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
					<Button
						onClick={handleSubmit}
						disabled={!canSubmit}
						isLoading={isSaving}
					>
						Create Rollout
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
