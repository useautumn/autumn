import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useState } from "react";
import { Card } from "../../components/index.js";

interface WarningScreenProps {
	orgName: string;
	customers: number;
	plans: number;
	features: number;
	onConfirm: () => void;
	onCancel: () => void;
}

/**
 * Initial warning screen showing what will be deleted
 * User must press 'y' to continue or 'n' to cancel
 */
export function WarningScreen({
	orgName,
	customers,
	plans,
	features,
	onConfirm,
	onCancel,
}: WarningScreenProps) {
	const [input, setInput] = useState("");

	useInput((_inputChar, key) => {
		if (key.escape) {
			onCancel();
		}
	});

	const handleSubmit = (value: string) => {
		if (value.toLowerCase() === "y") {
			onConfirm();
		} else {
			onCancel();
		}
	};

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Card title="⚠  DANGER: SANDBOX NUKE">
				<Text>
					This is{" "}
					<Text bold color="red">
						IRREVERSIBLE
					</Text>
					.
				</Text>
				<Box height={1} />
				<Text>
					Organization: <Text bold>{orgName}</Text>{" "}
					<Text dimColor>(sandbox)</Text>
				</Text>
				<Box height={1} />
				<Text>Items to be deleted:</Text>
				<Text>• {customers} customers</Text>
				<Text>• {plans} plans</Text>
				<Text>• {features} features</Text>
				<Box height={1} />
				<Text dimColor>This action CANNOT be undone.</Text>
				<Box height={1} />
				<Box flexDirection="row">
					<Text>
						Continue? <Text bold>(y/N)</Text>{" "}
					</Text>
					<Text color="magenta">{">"} </Text>
					<TextInput
						value={input}
						onChange={setInput}
						onSubmit={handleSubmit}
						placeholder=""
						showCursor={true}
					/>
				</Box>
			</Card>
		</Box>
	);
}
