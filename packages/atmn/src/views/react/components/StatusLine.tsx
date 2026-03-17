import { Text } from "ink";
import Spinner from "ink-spinner";

interface StatusLineProps {
	status: "pending" | "loading" | "success" | "error";
	message: string | React.JSX.Element;
	detail?: string;
}

export function StatusLine({ status, message, detail }: StatusLineProps) {
	const icon = {
		pending: <Text dimColor>○</Text>,
		loading: (
			<Text color="magenta">
				<Spinner type="dots" />
			</Text>
		),
		success: <Text color="green">✓</Text>,
		error: <Text color="red">✗</Text>,
	}[status];

	return (
		<Text>
			{icon} {message}
			{detail && <Text dimColor> ({detail})</Text>}
		</Text>
	);
}
