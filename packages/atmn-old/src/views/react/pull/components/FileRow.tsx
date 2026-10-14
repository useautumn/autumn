import { Text } from "ink";
import Spinner from "ink-spinner";

interface FileRowProps {
	name: string;
	lines: number;
	done: boolean;
}

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
