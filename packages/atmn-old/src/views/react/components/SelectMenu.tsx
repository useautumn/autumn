import SelectInput from "ink-select-input";

export interface SelectMenuItem<V = string> {
	label: string;
	value: V;
	disabled?: boolean;
}

export interface SelectMenuProps<V = string> {
	items: SelectMenuItem<V>[];
	onSelect: (item: SelectMenuItem<V>) => void;
}

export function SelectMenu<V = string>({
	items,
	onSelect,
}: SelectMenuProps<V>) {
	return <SelectInput items={items} onSelect={onSelect} />;
}
