import { Text } from "ink";
import Spinner from "ink-spinner";

interface LoadingTextProps {
	text: string;
}

/**
 * Shows a spinner with text
 */
export function LoadingText({ text }: LoadingTextProps) {
	return (
		<Text color="magenta">
			<Spinner type="dots" /> {text}
		</Text>
	);
}
