import { JsonSheet } from "./JsonSheet";

const titleForTool = (toolName?: string): string => {
	if (!toolName) return "Parameters";
	const action = toolName.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
	return `${action.charAt(0).toUpperCase()}${action.slice(1)} parameters`;
};

/** The write tool's resolved arguments (attach params, etc.), opened from the
 * approval card. */
export function ParamsSheet({
	onOpenChange,
	open,
	params,
	toolName,
}: {
	onOpenChange: (open: boolean) => void;
	open: boolean;
	params: Record<string, unknown>;
	toolName?: string;
}) {
	return (
		<JsonSheet
			onOpenChange={onOpenChange}
			open={open}
			title={titleForTool(toolName)}
			value={params}
		/>
	);
}
