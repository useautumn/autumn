import { InlineAction } from "@autumn/ui";
import { PlusIcon } from "@phosphor-icons/react";

export function AddRowAction({
	count,
	noun,
	onAdd,
}: {
	count: number;
	noun: string;
	onAdd: () => void;
}) {
	return (
		<InlineAction icon={<PlusIcon size={11} />} onClick={onAdd}>
			{count === 0 ? `Add a ${noun}` : `Add another ${noun}`}
		</InlineAction>
	);
}
