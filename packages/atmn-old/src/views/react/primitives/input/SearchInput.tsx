import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useState } from "react";

export interface SearchInputProps {
	initialValue?: string;
	placeholder?: string;
	onSubmit: (query: string) => void;
	onCancel: () => void;
}

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
