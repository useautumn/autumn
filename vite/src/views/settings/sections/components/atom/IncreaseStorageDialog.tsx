import {
	Button,
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@autumn/ui";
import { ArrowRightIcon } from "@phosphor-icons/react";
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

const NO_SIZE = "—";

/** The size per replica before or after the increase. */
const VolumeSizeBox = ({
	caption,
	gib,
	isTarget = false,
}: {
	caption: string;
	gib: number | null;
	isTarget?: boolean;
}) => (
	<div
		className={cn(
			"flex flex-1 flex-col gap-1 rounded-md border bg-card p-3",
			isTarget && "border-primary/40 bg-primary/10",
		)}
	>
		<span className="text-xs text-tertiary-foreground">{caption}</span>
		<span className="text-xl leading-[26px] text-foreground">
			{gib === null ? NO_SIZE : `${gib} GiB`}
		</span>
	</div>
);

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

					<div className="flex items-center gap-4">
						<VolumeSizeBox caption="Current · per replica" gib={currentGib} />
						<ArrowRightIcon className="size-4 shrink-0 text-subtle" />
						<VolumeSizeBox
							caption="New · per replica"
							gib={size.gib}
							isTarget
						/>
					</div>

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

					<p
						className={cn(
							"text-xs text-tertiary-foreground",
							size.error && "text-destructive",
						)}
					>
						{size.error ?? "Can only increase. Applies to both replicas."}
					</p>

					<div className="flex flex-col gap-1 border-t pt-3">
						<div className="flex justify-between text-[13px] text-foreground">
							<span>Storage / month</span>
							<span className="tabular-nums">
								{atomStorageMonthlyEstimate({ volumeSizeGib: currentGib })} →{" "}
								{size.gib === null
									? NO_SIZE
									: atomStorageMonthlyEstimate({ volumeSizeGib: size.gib })}
							</span>
						</div>
						{size.gib !== null && (
							<span className="text-xs text-tertiary-foreground">
								{atomStorageMonthlyIncrease({
									fromGib: currentGib,
									toGib: size.gib,
								})}{" "}
								/ month · AWS estimate · compute unchanged
							</span>
						)}
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
