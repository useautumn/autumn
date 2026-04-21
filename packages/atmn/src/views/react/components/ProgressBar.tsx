import { Box, Text } from "ink";

interface ProgressBarProps {
	value: number;
}

/** Simple progress bar for terminal display. Value is 0-100. */
export function ProgressBar({ value }: ProgressBarProps) {
	const clamped = Math.max(0, Math.min(100, value));
	const width = 20;
	const filled = Math.round((clamped / 100) * width);
	const empty = width - filled;

	const color = clamped >= 90 ? "red" : clamped >= 70 ? "yellow" : "green";

	return (
		<Box>
			<Text color={color}>{"█".repeat(filled)}</Text>
			<Text dimColor>{"░".repeat(empty)}</Text>
			<Text dimColor> {clamped}%</Text>
		</Box>
	);
}
