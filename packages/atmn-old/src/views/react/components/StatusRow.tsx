import { Text } from "ink";
import Spinner from "ink-spinner";

export type StatusRowStatus =
	| "pending"
	| "loading"
	| "success"
	| "warning"
	| "error"
	| "skipped";

export type StatusRowAction =
	| "created"
	| "updated"
	| "deleted"
	| "archived"
	| "skipped"
	| "unchanged"
	| "versioned";

interface StatusRowProps {
	status: StatusRowStatus;
	label: string;
	detail?: string;
	action?: StatusRowAction;
}

/**
 * Generic status row component with icon indicator
 */
export function StatusRow({ status, label, detail, action }: StatusRowProps) {
	const renderIcon = () => {
		switch (status) {
			case "pending":
				return <Text dimColor> </Text>;
			case "loading":
				return (
					<Text color="magenta">
						<Spinner type="dots" />
					</Text>
				);
			case "success":
				return <Text color="green">✓</Text>;
			case "warning":
				return <Text color="yellow">⚠</Text>;
			case "error":
				return <Text color="red">✗</Text>;
			case "skipped":
				return <Text color="gray">⊘</Text>;
			default:
				return <Text> </Text>;
		}
	};

	const renderAction = () => {
		if (!action) return null;

		const actionColor =
			action === "skipped" || action === "unchanged" ? "gray" : "green";

		return (
			<Text color={actionColor} dimColor={action === "unchanged"}>
				{" "}
				({action})
			</Text>
		);
	};

	return (
		<Text>
			{renderIcon()} {label}
			{detail && <Text color="gray"> {detail}</Text>}
			{renderAction()}
		</Text>
	);
}
