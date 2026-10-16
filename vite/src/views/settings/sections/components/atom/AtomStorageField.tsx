import { AtomFieldRow } from "./AtomFieldRow";
import { AtomCustomVolumeInput, AtomVolumeOption } from "./AtomVolumeOptions";
import {
	ATOM_STORAGE_PER_GIB_LABEL,
	type AtomVolumeChoice,
	type AtomVolumeSize,
	atomStorageMonthlyEstimate,
	atomVolumePresets,
} from "./atomVolumeDisplay";

const OPTION_CLASS = "min-w-0 max-w-32 flex-1 px-3 py-[7px]";

/** Each preset's or the typed size's price for both volumes; Custom shows its rate until a size is typed. */
const optionCaption = (gib: number | null) =>
	gib === null
		? ATOM_STORAGE_PER_GIB_LABEL
		: `${atomStorageMonthlyEstimate({ volumeSizeGib: gib })} / mo`;

/** The setup's Storage row: each preset priced for both replicas, or a custom size typed beside them. */
export const AtomStorageField = ({
	choice,
	size,
	onChange,
}: {
	choice: AtomVolumeChoice;
	size: AtomVolumeSize;
	onChange: (choice: AtomVolumeChoice) => void;
}) => {
	const isCustom = choice.presetGib === null;
	return (
		<AtomFieldRow label="Storage" isMuted isTall>
			<div className="flex w-full gap-1.5">
				{atomVolumePresets().map((gib) => (
					<AtomVolumeOption
						key={gib}
						label={`${gib} GiB`}
						caption={optionCaption(gib)}
						isSelected={choice.presetGib === gib}
						onSelect={() => onChange({ ...choice, presetGib: gib })}
						className={OPTION_CLASS}
					/>
				))}
				<AtomVolumeOption
					label="Custom…"
					caption={optionCaption(isCustom ? size.gib : null)}
					isSelected={isCustom}
					onSelect={() => onChange({ ...choice, presetGib: null })}
					className={OPTION_CLASS}
				/>
			</div>
			{isCustom && (
				<AtomCustomVolumeInput
					value={choice.customGib}
					onChange={(customGib) => onChange({ ...choice, customGib })}
					hasError={size.error !== null}
				/>
			)}
			{size.error ? (
				<span className="text-[11px] leading-4 text-destructive">
					{size.error}
				</span>
			) : (
				<span className="text-[11px] leading-4 text-tertiary-foreground">
					Size per replica · prices include both volumes
				</span>
			)}
		</AtomFieldRow>
	);
};
