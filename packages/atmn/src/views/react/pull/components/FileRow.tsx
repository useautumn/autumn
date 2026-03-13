import { Text } from "ink";
import Spinner from "ink-spinner";

interface FileRowProps {
	name: string;
	lines: number;
	done: boolean;
}

/**
 * Displays a generated file with spinner or checkmark
 */
export function FileRow({ name, lines, done }: FileRowProps) {
	return (
		<Text>
			{done ? (
				<Text color="green">✓</Text>
			) : (
				<Text color="magenta">
					<Spinner type="dots" />
				</Text>
			)}{" "}
			{name} <Text color="gray">{lines} lines</Text>
		</Text>
	);
}
