import {
	Button,
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@autumn/ui";
import { useStore } from "@tanstack/react-form";
import { toast } from "sonner";
import { useAppForm } from "@/hooks/form/form";
import { cn } from "@/lib/utils";
import { getBackendErr } from "@/utils/genUtils";
import { AtomCustomVolumeInput, AtomVolumeOption } from "./AtomVolumeOptions";
import {
	type AtomVolumeChoice,
	atomStorageMonthlyEstimate,
	atomStorageMonthlyIncrease,
	atomVolumePresets,
	atomVolumeSize,
} from "./atomVolumeDisplay";
import type { AtomActions } from "./useAtomActions";

/** e.g. "55 → 100 GiB per replica · +$7.20/mo (storage ~$8.80 → ~$16.00)" */
const increaseSummary = ({
	fromGib,
	toGib,
}: {
	fromGib: number;
	toGib: number;
}) =>
	`${fromGib} → ${toGib} GiB per replica · ${atomStorageMonthlyIncrease({ fromGib, toGib })}/mo (storage ${atomStorageMonthlyEstimate({ volumeSizeGib: fromGib })} → ${atomStorageMonthlyEstimate({ volumeSizeGib: toGib })})`;

/** The smallest preset above the current size, else Custom. */
const defaultChoice = (currentGib: number): AtomVolumeChoice => ({
	presetGib: atomVolumePresets({ aboveGib: currentGib })[0] ?? null,
	customGib: "",
});

/** Grows both replicas' volumes to a preset or typed size; it never offers one at or below the current size. */
export const IncreaseStorageDialog = ({
	open,
	onOpenChange,
	currentGib,
	increaseStorage,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	currentGib: number;
	increaseStorage: AtomActions["increaseStorage"];
}) => {
	const form = useAppForm({
		defaultValues: { volume: defaultChoice(currentGib) },
		onSubmit: async ({ value }) => {
			const { gib } = atomVolumeSize({
				choice: value.volume,
				aboveGib: currentGib,
			});
			if (gib === null) return;
			try {
				await increaseStorage.mutateAsync({ volumeSizeGib: gib });
				onOpenChange(false);
				toast.success(`Increasing storage to ${gib} GiB per replica`);
			} catch (error) {
				toast.error(getBackendErr(error, "Failed to increase storage"));
			}
		},
	});
	const choice = useStore(form.store, (state) => state.values.volume);
	const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
	const size = atomVolumeSize({ choice, aboveGib: currentGib });
	const isCustom = choice.presetGib === null;
	const setChoice = (volume: AtomVolumeChoice) =>
		form.setFieldValue("volume", volume);

	const changeOpen = (nextOpen: boolean) => {
		if (!nextOpen) form.reset({ volume: defaultChoice(currentGib) });
		onOpenChange(nextOpen);
	};

	return (
		<Dialog open={open} onOpenChange={changeOpen}>
			<DialogContent className="max-w-[440px]">
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						form.handleSubmit();
					}}
				>
					<DialogHeader>
						<DialogTitle>Increase storage</DialogTitle>
					</DialogHeader>

					<div className="flex flex-col gap-2">
						<div className="flex gap-1.5">
							{atomVolumePresets({ aboveGib: currentGib }).map((gib) => (
								<AtomVolumeOption
									key={gib}
									label={`${gib} GiB`}
									isSelected={choice.presetGib === gib}
									onSelect={() => setChoice({ ...choice, presetGib: gib })}
									disabled={isSubmitting}
									className="h-7 flex-1 items-center justify-center"
								/>
							))}
							<AtomVolumeOption
								label="Custom…"
								isSelected={isCustom}
								onSelect={() => setChoice({ ...choice, presetGib: null })}
								disabled={isSubmitting}
								className="h-7 flex-1 items-center justify-center"
							/>
						</div>
						{isCustom && (
							<AtomCustomVolumeInput
								value={choice.customGib}
								onChange={(customGib) => setChoice({ ...choice, customGib })}
								hasError={size.error !== null}
								disabled={isSubmitting}
							/>
						)}
					</div>

					<div className="flex flex-col gap-1">
						{size.gib !== null && (
							<p className="text-sm text-foreground tabular-nums">
								{increaseSummary({ fromGib: currentGib, toGib: size.gib })}
							</p>
						)}
						<p
							className={cn(
								"text-xs text-tertiary-foreground",
								size.error && "text-destructive",
							)}
						>
							{size.error ?? "Can only increase. Applies to both replicas."}
						</p>
					</div>

					<DialogFooter className="sm:justify-end *:flex-none">
						<Button
							type="button"
							variant="secondary"
							onClick={() => changeOpen(false)}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							variant="primary"
							disabled={size.gib === null}
							isLoading={isSubmitting}
						>
							{size.gib === null
								? "Increase storage"
								: `Increase to ${size.gib} GiB`}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
};
