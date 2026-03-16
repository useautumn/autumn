import { MultiSelect } from "@inkjs/ui";
import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import {
	type AgentIdentifier,
	type FileOption,
	useAgentSetup,
} from "../../../../lib/hooks/index.js";
import { StatusLine, StepHeader } from "../../components/index.js";

interface AgentStepProps {
	step: number;
	totalSteps: number;
	onComplete: () => void;
}

type AgentState =
	| "selecting"
	| "mcp-agents"
	| "installing"
	| "creating"
	| "complete"
	| "error";

/**
 * Agent setup step - allows user to configure agent files
 */
export function AgentStep({ step, totalSteps, onComplete }: AgentStepProps) {
	const [state, setState] = useState<AgentState>("selecting");
	const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
	const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
	const [error, setError] = useState<string | null>(null);

	const { installMcp, createAgentFiles } = useAgentSetup();

	const options = [
		{
			label: "MCP Server Config (for Claude Code, OpenCode, etc.)",
			value: "mcp",
		},
		{
			label: "CLAUDE.md",
			value: "claude-md",
		},
		{
			label: "AGENTS.md",
			value: "agents-md",
		},
		{
			label: ".cursorrules",
			value: "cursor-rules",
		},
	];

	const agentOptions = [
		{
			label: "Claude Code (auto-install via command)",
			value: "claude-code",
		},
		{
			label: "OpenCode, Codex and others (copy URL to clipboard)",
			value: "other",
		},
	];

	const handleSubmit = (values: string[]) => {
		setSelectedOptions(values);

		// If MCP is selected, go to agent selection
		if (values.includes("mcp")) {
			setState("mcp-agents");
		} else {
			// Otherwise, create the other files
			setState("creating");
			const fileOptions = values.filter((v) => v !== "mcp") as FileOption[];
			createAgentFiles.mutate(fileOptions);
		}
	};

	const handleAgentSubmit = (agents: string[]) => {
		setSelectedAgents(agents);
		setState("installing");

		// Install MCP for selected agents
		installMcp.mutate(agents as AgentIdentifier[]);
	};

	// Handle MCP installation completion
	useEffect(() => {
		if (installMcp.isSuccess && state === "installing") {
			// Now create the other selected files
			const nonMcpOptions = selectedOptions.filter(
				(opt) => opt !== "mcp",
			) as FileOption[];
			if (nonMcpOptions.length > 0) {
				setState("creating");
				createAgentFiles.mutate(nonMcpOptions);
			} else {
				setState("complete");
				setTimeout(() => {
					onComplete();
				}, 1000);
			}
		}
	}, [
		installMcp.isSuccess,
		state,
		selectedOptions,
		onComplete,
		createAgentFiles,
	]);

	// Handle MCP installation error
	useEffect(() => {
		if (installMcp.isError) {
			setError(
				installMcp.error instanceof Error
					? installMcp.error.message
					: "Failed to install MCP",
			);
			setState("error");
		}
	}, [installMcp.isError, installMcp.error]);

	// Handle file creation completion
	useEffect(() => {
		if (createAgentFiles.isSuccess && state === "creating") {
			setState("complete");
			setTimeout(() => {
				onComplete();
			}, 1000);
		}
	}, [createAgentFiles.isSuccess, state, onComplete]);

	// Handle file creation error
	useEffect(() => {
		if (createAgentFiles.isError) {
			setError(
				createAgentFiles.error instanceof Error
					? createAgentFiles.error.message
					: "Failed to create files",
			);
			setState("error");
		}
	}, [createAgentFiles.isError, createAgentFiles.error]);

	const handleChange = (values: string[]) => {
		setSelectedOptions(values);
	};

	const handleAgentChange = (values: string[]) => {
		setSelectedAgents(values);
	};

	if (state === "selecting") {
		return (
			<Box flexDirection="column" marginBottom={1}>
				<StepHeader step={step} totalSteps={totalSteps} title="Agent Setup" />
				<Box flexDirection="column">
					<Text>Select agent configuration files to create/update:</Text>
					<Text dimColor>(Space to select, Enter to confirm)</Text>
					<Box marginTop={1}>
						<MultiSelect
							options={options}
							onChange={handleChange}
							onSubmit={handleSubmit}
							visibleOptionCount={5}
						/>
					</Box>
				</Box>
			</Box>
		);
	}

	if (state === "mcp-agents") {
		return (
			<Box flexDirection="column" marginBottom={1}>
				<StepHeader step={step} totalSteps={totalSteps} title="Agent Setup" />
				<Box flexDirection="column">
					<Text>Which agent(s) are you using?</Text>
					<Text dimColor>(Space to select, Enter to confirm)</Text>
					<Box marginTop={1}>
						<MultiSelect
							options={agentOptions}
							onChange={handleAgentChange}
							onSubmit={handleAgentSubmit}
							visibleOptionCount={5}
						/>
					</Box>
				</Box>
			</Box>
		);
	}

	if (state === "installing") {
		const installMessages: string[] = [];

		if (selectedAgents.includes("claude-code")) {
			installMessages.push("Installing MCP for Claude Code...");
		}

		if (
			selectedAgents.includes("opencode") ||
			selectedAgents.includes("other")
		) {
			installMessages.push("Copied MCP URL to clipboard!");
		}

		return (
			<Box flexDirection="column" marginBottom={1}>
				<StepHeader step={step} totalSteps={totalSteps} title="Agent Setup" />
				<Box flexDirection="column">
					{installMessages.map((msg) => (
						<StatusLine
							key={msg}
							status={msg.includes("Copied") ? "success" : "loading"}
							message={msg}
						/>
					))}
				</Box>
			</Box>
		);
	}

	if (state === "creating") {
		return (
			<Box flexDirection="column" marginBottom={1}>
				<StepHeader step={step} totalSteps={totalSteps} title="Agent Setup" />
				<StatusLine
					status="loading"
					message={`Creating ${selectedOptions.filter((o) => o !== "mcp").length} file${selectedOptions.filter((o) => o !== "mcp").length !== 1 ? "s" : ""}...`}
				/>
			</Box>
		);
	}

	if (state === "complete") {
		const createdFiles: string[] = [];

		if (selectedAgents.length > 0) {
			createdFiles.push("MCP server config");
		}
		if (selectedOptions.includes("claude-md")) {
			createdFiles.push("CLAUDE.md");
		}
		if (selectedOptions.includes("agents-md")) {
			createdFiles.push("AGENTS.md");
		}
		if (selectedOptions.includes("cursor-rules")) {
			createdFiles.push(".cursorrules");
		}

		return (
			<Box flexDirection="column" marginBottom={1}>
				<StepHeader step={step} totalSteps={totalSteps} title="Agent Setup" />
				<StatusLine
					status="success"
					message={
						createdFiles.length > 0
							? `Created ${createdFiles.join(", ")}`
							: "Setup complete"
					}
				/>
			</Box>
		);
	}

	if (state === "error") {
		return (
			<Box flexDirection="column" marginBottom={1}>
				<StepHeader step={step} totalSteps={totalSteps} title="Agent Setup" />
				<StatusLine
					status="error"
					message={error || "Failed to create files"}
				/>
			</Box>
		);
	}

	return null;
}
