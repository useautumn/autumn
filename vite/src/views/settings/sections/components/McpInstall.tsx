import {
	Button,
	Card,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@autumn/ui";
import { useState } from "react";
import CopyButton from "@/components/general/CopyButton";
import {
	CodeGroup,
	CodeGroupCode,
	CodeGroupContent,
	CodeGroupCopyButton,
	CodeGroupList,
	CodeGroupTab,
} from "@/components/v2/CodeGroup";

const MCP_NAME = "autumn";
const MCP_URL = "https://mcp.useautumn.com/mcp";

// Web-redirect deeplinks the editors register to one-click install a remote server.
const cursorDeeplink = `https://cursor.com/en/install-mcp?name=${MCP_NAME}&config=${btoa(
	JSON.stringify({ name: MCP_NAME, type: "http", url: MCP_URL }),
)}`;
const vscodeDeeplink = `https://vscode.dev/redirect/mcp/install?name=${MCP_NAME}&config=${encodeURIComponent(
	JSON.stringify({ type: "http", url: MCP_URL }),
)}`;

interface ManualConfig {
	filename: string;
	language: string;
	text: string;
}

interface Client {
	id: string;
	label: string;
	install?: { label: string; href: string };
	command?: string;
	hint?: string;
	manual?: ManualConfig;
}

const clients: Client[] = [
	{
		id: "cursor",
		label: "Cursor",
		install: { label: "Add to Cursor", href: cursorDeeplink },
		manual: {
			filename: "~/.cursor/mcp.json",
			language: "json",
			text: JSON.stringify(
				{ mcpServers: { [MCP_NAME]: { url: MCP_URL } } },
				null,
				2,
			),
		},
	},
	{
		id: "vscode",
		label: "VS Code",
		install: { label: "Install in VS Code", href: vscodeDeeplink },
		manual: {
			filename: ".vscode/mcp.json",
			language: "json",
			text: JSON.stringify(
				{ servers: { [MCP_NAME]: { type: "http", url: MCP_URL } } },
				null,
				2,
			),
		},
	},
	{
		id: "claude-code",
		label: "Claude Code",
		command: `claude mcp add --transport http ${MCP_NAME} ${MCP_URL}`,
	},
	{
		id: "codex",
		label: "Codex",
		command: `codex mcp add ${MCP_NAME} --url ${MCP_URL}`,
	},
	{
		id: "claude-desktop",
		label: "Claude Desktop",
		hint: "Settings → Connectors → Add custom connector, then paste the URL and sign in.",
		command: MCP_URL,
	},
];

const CommandBar = ({ text }: { text: string }) => (
	<div className="flex items-center gap-2 rounded-lg border bg-interactive-secondary py-1 pr-1 pl-3">
		<code className="flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs text-secondary-foreground">
			{text}
		</code>
		<CopyButton text={text} variant="skeleton" className="shrink-0" />
	</div>
);

const ManualConfigBlock = ({ config }: { config: ManualConfig }) => (
	<CodeGroup value={config.filename}>
		<CodeGroupList>
			<CodeGroupTab value={config.filename}>{config.filename}</CodeGroupTab>
			<CodeGroupCopyButton
				onCopy={() => navigator.clipboard.writeText(config.text)}
			/>
		</CodeGroupList>
		<CodeGroupContent value={config.filename} copyText={config.text}>
			<CodeGroupCode language={config.language}>{config.text}</CodeGroupCode>
		</CodeGroupContent>
	</CodeGroup>
);

export const McpInstall = () => {
	const [activeId, setActiveId] = useState(clients[0].id);
	const client = clients.find((item) => item.id === activeId) ?? clients[0];

	return (
		<div className="flex flex-col gap-3 pb-6">
			<div className="flex flex-col gap-0.5">
				<span className="text-sm font-medium text-foreground">
					Install in your editor
				</span>
				<span className="text-xs text-tertiary-foreground">
					Connect Autumn's MCP tools to your AI client. Sign-in happens in your
					editor — no API key needed.
				</span>
			</div>

			<Card className="gap-3 p-4">
				<div className="flex items-center justify-between gap-2">
					<Select value={activeId} onValueChange={setActiveId}>
						<SelectTrigger className="h-7 w-48">
							<SelectValue>{client.label}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{clients.map((item) => (
								<SelectItem key={item.id} value={item.id}>
									{item.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					{client.install && (
						<Button variant="primary" size="default" asChild>
							<a
								href={client.install.href}
								target="_blank"
								rel="noopener noreferrer"
							>
								{client.install.label}
							</a>
						</Button>
					)}
				</div>

				<div className="flex flex-col gap-2.5">
					{client.hint && (
						<span className="text-xs text-tertiary-foreground">
							{client.hint}
						</span>
					)}
					{client.command && <CommandBar text={client.command} />}
					{client.manual && <ManualConfigBlock config={client.manual} />}
				</div>
			</Card>
		</div>
	);
};
