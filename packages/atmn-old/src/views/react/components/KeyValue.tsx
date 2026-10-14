import { Text } from "ink";

interface KeyValueProps {
	label: string;
	value: string;
}

export function KeyValue({ label, value }: KeyValueProps) {
	return (
		<Text>
			<Text color="gray">{label}:</Text> {value}
		</Text>
	);
}
