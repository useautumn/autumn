import { CheckIcon } from "@phosphor-icons/react";

/** A SearchableSelect row for the Usage filters: name, optional ID, check when picked. */
export const SelectOptionLabel = ({
	name,
	secondary,
	isSelected,
}: {
	name: string;
	secondary?: string | null;
	isSelected: boolean;
}) => (
	<>
		<span className="min-w-0 flex-1 truncate">{name}</span>
		{secondary && (
			<span className="max-w-32 shrink-0 truncate text-tiny-id text-tertiary-foreground">
				{secondary}
			</span>
		)}
		{isSelected && <CheckIcon className="text-foreground" />}
	</>
);
