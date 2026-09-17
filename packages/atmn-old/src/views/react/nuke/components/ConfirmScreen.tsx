import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { Card } from "../../components/index.js";

interface ConfirmScreenProps {
	orgName: string;
	customers: number;
	plans: number;
	features: number;
	onConfirm: () => void;
	onCancel: () => void;
}

/**
 * Final confirmation screen
 * User must type the organization name exactly to proceed
 */
export function ConfirmScreen({
	orgName,
	customers,
	plans,
	features,
	onConfirm,
	onCancel,
}: ConfirmScreenProps) {
	const [input, setInput] = useState("");
	const [error, setError] = useState<string | null>(null);

	useInput((inputChar, key) => {
		if (key.return) {
			if (input === orgName) {
				onConfirm();
			} else {
				setError(`Incorrect. Expected "${orgName}"`);
				setTimeout(() => setError(null), 2000);
			}
		} else if (key.escape) {
			onCancel();
		} else if (key.backspace || key.delete) {
			setInput((prev) => prev.slice(0, -1));
		} else if (inputChar && !key.ctrl && !key.meta) {
			setInput((prev) => prev + inputChar);
		}
	});

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Card title="🔥 FINAL CONFIRMATION">
				<Text bold color="red">
					This is your LAST CHANCE to abort.
				</Text>
				<Box height={1} />
				<Text>You are about to delete:</Text>
				<Text>• {customers} customers</Text>
				<Text>• {plans} plans</Text>
				<Text>• {features} features</Text>
				<Box height={1} />
				<Text>
					From organization: <Text bold>{orgName}</Text>{" "}
					<Text dimColor>(sandbox)</Text>
				</Text>
				<Box height={1} />
				<Text>Type your organization name to confirm:</Text>
				<Text>
					{">"} <Text color="magenta">{input}</Text>
					<Text color="magenta">█</Text>
				</Text>

				{error && (
					<>
						<Box height={1} />
						<Text color="red">{error}</Text>
					</>
				)}

				<Box height={1} />
				<Text dimColor>Esc to cancel</Text>
			</Card>
		</Box>
	);
}
