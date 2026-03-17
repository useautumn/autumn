import { exec } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { useMutation } from "@tanstack/react-query";
import clipboard from "clipboardy";

const execAsync = promisify(exec);

const MCP_URL = "https://docs.useautumn.com/mcp";

// Markdown content for CLAUDE.md and AGENTS.md
const markdownContent = `

# Autumn Billing Integration

## Overview

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.

## Usage

Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

## Features

- Lorem ipsum dolor sit amet
- Consectetur adipiscing elit
- Sed do eiusmod tempor incididunt

## Resources

- [Autumn Documentation](https://docs.useautumn.com)
- [API Reference](https://docs.useautumn.com/api)
`;

// Content for .cursorrules
const cursorRulesContent = `

# Autumn Billing Rules

Lorem ipsum dolor sit amet, consectetur adipiscing elit.
Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
`;

export type AgentIdentifier = "claude-code" | "other";
export type FileOption = "claude-md" | "agents-md" | "cursor-rules";

export interface InstallMcpResult {
	installedAgents: AgentIdentifier[];
	copiedToClipboard: boolean;
}

export interface CreateAgentFilesResult {
	createdFiles: string[];
}

/**
 * Install MCP for the specified agents
 */
async function installMcpForAgents(
	agents: AgentIdentifier[],
): Promise<InstallMcpResult> {
	const installedAgents: AgentIdentifier[] = [];
	let copiedToClipboard = false;

	for (const agent of agents) {
		if (agent === "claude-code") {
			try {
				await execAsync(`claude mcp add --transport http autumn ${MCP_URL}`);
				installedAgents.push("claude-code");
			} catch (err) {
				// If it fails, it might already exist - check the error message
				const errorMessage = err instanceof Error ? err.message : String(err);
				if (!errorMessage.includes("already exists")) {
					// If it's not an "already exists" error, throw it
					throw err;
				}
				// Otherwise, silently continue (already installed is fine)
				installedAgents.push("claude-code");
			}
		} else if (agent === "other") {
			// Copy URL to clipboard
			await clipboard.write(MCP_URL);
			copiedToClipboard = true;
		}
	}

	return { installedAgents, copiedToClipboard };
}

/**
 * Helper function to append to existing file or create new file
 */
async function appendOrCreate(
	filePath: string,
	content: string,
): Promise<void> {
	try {
		// Try to read existing file
		await fs.access(filePath);
		// File exists, append content
		await fs.appendFile(filePath, content, "utf-8");
	} catch {
		// File doesn't exist, create it
		await fs.writeFile(filePath, content.trimStart(), "utf-8");
	}
}

/**
 * Create agent configuration files based on selected options
 */
async function createAgentFilesForOptions(
	options: FileOption[],
	cwd?: string,
): Promise<CreateAgentFilesResult> {
	const effectiveCwd = cwd ?? process.cwd();
	const createdFiles: string[] = [];

	for (const option of options) {
		if (option === "claude-md") {
			await appendOrCreate(
				path.join(effectiveCwd, "CLAUDE.md"),
				markdownContent,
			);
			createdFiles.push("CLAUDE.md");
		} else if (option === "agents-md") {
			await appendOrCreate(
				path.join(effectiveCwd, "AGENTS.md"),
				markdownContent,
			);
			createdFiles.push("AGENTS.md");
		} else if (option === "cursor-rules") {
			await appendOrCreate(
				path.join(effectiveCwd, ".cursorrules"),
				cursorRulesContent,
			);
			createdFiles.push(".cursorrules");
		}
	}

	return { createdFiles };
}

export interface UseAgentSetupOptions {
	cwd?: string;
}

/**
 * Hook for managing agent setup operations including MCP installation
 * and agent configuration file creation.
 */
export function useAgentSetup(options?: UseAgentSetupOptions) {
	const cwd = options?.cwd;

	const installMcp = useMutation({
		mutationFn: async (agents: AgentIdentifier[]) => {
			return await installMcpForAgents(agents);
		},
	});

	const createAgentFiles = useMutation({
		mutationFn: async (fileOptions: FileOption[]) => {
			return await createAgentFilesForOptions(fileOptions, cwd);
		},
	});

	return {
		installMcp,
		createAgentFiles,
	};
}
