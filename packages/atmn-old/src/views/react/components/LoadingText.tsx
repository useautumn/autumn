import { Text } from "ink";
import Spinner from "ink-spinner";

interface LoadingTextProps {
	text: string;
}

export function LoadingText({ text }: LoadingTextProps) {
	return (
		<Text color="magenta">
			<Spinner type="dots" /> {text}
		</Text>
	);
}
