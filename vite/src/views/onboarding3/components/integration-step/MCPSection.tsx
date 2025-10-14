import { InfoIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { IconButton } from "@/components/v2/buttons/IconButton";

export const MCPSection = () => {
	const mcpConfig = {
		name: "Autumn Docs",
		url: "https://docs.useautumn.com/mcp",
		headers: {},
	};

	const encodedConfig = btoa(JSON.stringify(mcpConfig));
	const cursorInstallUrl = `cursor://anysphere.cursor-deeplink/mcp/install?name=Autumn%20Docs&config=${encodedConfig}`;

	const handleCursorInstall = () => {
		window.open(cursorInstallUrl, "_blank");
	};

	const handleCopyClaudeCommand = () => {
		navigator.clipboard.writeText(
			"claude mcp add --transport http autumn-docs https://docs.useautumn.com/mcp",
		);
		toast.success(
			"Copied command to clipboard. Paste in your terminal to install.",
		);
	};

	return (
		<div className="px-3 py-3.5 bg-gray-50 rounded-lg outline-[1.50px] outline-offset-[-1.50px] outline-violet-600 flex flex-col items-start gap-4">
			<div className="inline-flex justify-start items-center gap-1.5">
				<InfoIcon fill="var(--primary)" size={16} weight="fill" />
				<div className="justify-start text-zinc-800 text-xs font-semibold font-['Inter']">
					Install our MCP and prompt the model to use the `autumn-docs` MCP to
					integrate Autumn
				</div>
			</div>
			<div className="inline-flex justify-start items-start gap-3">
				<IconButton
					variant="secondary"
					size="sm"
					onClick={handleCursorInstall}
					icon={<img className="w-3.5 h-3.5" src="/cursor.png" alt="Cursor" />}
				>
					Open in Cursor
				</IconButton>
				<IconButton
					variant="secondary"
					size="sm"
					onClick={handleCopyClaudeCommand}
					icon={<img className="w-3.5 h-3.5" src="/claude.png" alt="Claude" />}
				>
					Copy install command
				</IconButton>
			</div>
		</div>
	);
};
