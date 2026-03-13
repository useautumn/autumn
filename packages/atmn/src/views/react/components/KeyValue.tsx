import { Text } from "ink";

interface KeyValueProps {
	label: string;
	value: string;
}

/**
 * Displays a key-value pair with styled label
 */
export function KeyValue({ label, value }: KeyValueProps) {
	return (
		<Text>
			<Text color="gray">{label}:</Text> {value}
		</Text>
	);
}
