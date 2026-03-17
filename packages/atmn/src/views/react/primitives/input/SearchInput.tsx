import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useState } from "react";

export interface SearchInputProps {
	/** Initial search value */
	initialValue?: string;
	/** Placeholder text */
	placeholder?: string;
	/** Called when search is submitted (Enter pressed) */
	onSubmit: (query: string) => void;
	/** Called when search is cancelled (Escape pressed) */
	onCancel: () => void;
}

/**
 * Inline search input with submit/cancel keyboard handling
 */
export function SearchInput({
	initialValue = "",
	placeholder = "Search...",
	onSubmit,
	onCancel,
}: SearchInputProps) {
	const [value, setValue] = useState(initialValue);

	useInput((_input, key) => {
		if (key.escape) {
			onCancel();
			return;
		}
		if (key.return) {
			onSubmit(value.trim());
			return;
		}
	});

	return (
		<Box borderStyle="round" borderColor="magenta" paddingX={1} width="100%">
			<Text color="magenta">Search: </Text>
			<TextInput value={value} onChange={setValue} placeholder={placeholder} />
		</Box>
	);
}
