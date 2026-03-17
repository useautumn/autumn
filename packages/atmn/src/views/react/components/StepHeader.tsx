import { Box, Text } from "ink";

interface StepHeaderProps {
	step: number;
	totalSteps: number;
	title: string;
}

export function StepHeader({ step, totalSteps, title }: StepHeaderProps) {
	return (
		<Box flexDirection="column" marginBottom={0}>
			<Text>
				<Text color="magenta" bold>
					Step {step}/{totalSteps}:
				</Text>{" "}
				<Text bold>{title}</Text>
			</Text>
			<Text color="magentaBright">
				{"─".repeat(`Step ${step}/${totalSteps}:`.length)}
			</Text>
		</Box>
	);
}
