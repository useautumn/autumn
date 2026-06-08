import type { AutumnLogger } from "@autumn/logging";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { logger as rootLogger } from "../../lib/logger.js";
import {
	assertSafeSandboxCommand,
	sandboxLimits,
	sanitizeReturnFiles,
	sanitizeSandboxFiles,
	truncateSandboxResult,
} from "./guardrails.js";
import type { SandboxProvider } from "./types.js";

const sandboxFileSchema = z
	.object({
		path: z.string().min(1),
		content: z.string(),
	})
	.strict();

export const createSandboxTools = ({
	logger = rootLogger,
	onAction,
	provider,
}: {
	logger?: AutumnLogger;
	onAction?: (message: string) => Promise<void> | void;
	provider: SandboxProvider;
}): Record<string, ReturnType<typeof createTool>> => ({
	runSandboxCommand: createTool({
		id: "runSandboxCommand",
		description:
			"Run a short command in an isolated sandbox for parsing, calculations, JSON/CSV transforms, and file analysis. Do not use it for Autumn writes, credentials, secrets, or direct API calls.",
		inputSchema: z
			.object({
				task: z.string().min(1),
				command: z.string().min(1),
				files: z
					.array(sandboxFileSchema)
					.max(sandboxLimits.maxFiles)
					.optional(),
				returnFiles: z
					.array(z.string().min(1))
					.max(sandboxLimits.maxFiles)
					.optional(),
			})
			.strict(),
		execute: async ({ task, command, files = [], returnFiles = [] }) => {
			await onAction?.("Running sandbox analysis");
			const startedAt = Date.now();
			const safeCommand = assertSafeSandboxCommand(command);
			const safeFiles = sanitizeSandboxFiles(files);
			const safeReturnFiles = sanitizeReturnFiles(returnFiles);
			logger.info("Calling sandbox tool", {
				event: "leaf.sandbox_tool_called",
				data: {
					file_count: safeFiles.length,
					return_file_count: safeReturnFiles.length,
					command_length: safeCommand.length,
					task_length: task.length,
				},
			});
			const result = truncateSandboxResult(
				await provider.run({
					command: safeCommand,
					files: safeFiles,
					returnFiles: safeReturnFiles,
					timeoutMs: sandboxLimits.timeoutMs,
				}),
			);
			logger.info("Completed sandbox tool", {
				event: "leaf.sandbox_tool_completed",
				data: {
					duration_ms: Date.now() - startedAt,
					file_count: result.files.length,
					exit_code: result.exitCode,
					timed_out: result.timedOut,
				},
			});
			return result;
		},
	}),
});
