import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { Card } from "../../components/index.js";

interface BackupPromptProps {
	onChoice: (createBackup: boolean) => void;
}

/**
 * Backup prompt screen
 * User can choose to create backup or skip
 */
export function BackupPrompt({ onChoice }: BackupPromptProps) {
	const [selectedIndex, setSelectedIndex] = useState(0);

	const options = [
		{ label: "Yes, create backup (recommended)", value: true },
		{ label: "No, skip backup", value: false },
	];

	useInput((input, key) => {
		if (key.upArrow) {
			setSelectedIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
		} else if (key.downArrow) {
			setSelectedIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
		} else if (key.return) {
			onChoice(options[selectedIndex]?.value ?? false);
		} else if (input.toLowerCase() === "y") {
			onChoice(true);
		} else if (input.toLowerCase() === "n") {
			onChoice(false);
		}
	});

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Card title="💾 Backup Configuration">
				<Text>Would you like to backup your config?</Text>
				<Text dimColor>(Highly recommended)</Text>
				<Box height={1} />
				<Text dimColor>Backup location:</Text>
				<Text dimColor>→ ./autumn.config.ts.backup</Text>
				<Box height={1} />

				{options.map((option, index) => (
					<Text key={option.label}>
						{selectedIndex === index ? (
							<Text color="magenta">❯ {option.label}</Text>
						) : (
							<Text dimColor> {option.label}</Text>
						)}
					</Text>
				))}

				<Box height={1} />
				<Text dimColor>
					↑↓ Navigate • Enter to select • <Text bold>(Y)</Text> Yes •{" "}
					<Text bold>(N)</Text> No
				</Text>
			</Card>
		</Box>
	);
}
