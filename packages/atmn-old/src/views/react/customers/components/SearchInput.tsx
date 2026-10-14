import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useState } from "react";

export interface SearchInputProps {
	initialValue: string;
	onSubmit: (query: string) => void;
	onCancel: () => void;
}

export function SearchInput({
	initialValue,
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
			onSubmit(value);
			return;
		}
	});

	return (
		<Box borderStyle="round" borderColor="magenta" paddingX={1} width="100%">
			<Text color="magenta">Search: </Text>
			<TextInput
				value={value}
				onChange={setValue}
				placeholder="id, name, or email..."
			/>
			<Text color="gray"> (Enter to search, Esc to cancel)</Text>
		</Box>
	);
}
