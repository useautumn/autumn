import { describe, expect, test } from "bun:test";
import { createSandboxTools } from "../../../../src/internal/sandbox/tool/createSandboxTools.js";
import type { SandboxProvider } from "../../../../src/internal/sandbox/types.js";

const execute = async (
	tool: { execute?: (...args: never[]) => Promise<unknown> } | undefined,
	input: unknown,
) => {
	if (!tool?.execute) throw new Error("Tool is not executable");
	return tool.execute(input as never, {} as never);
};

describe("sandbox tools", () => {
	test("calls provider with sanitized files and return paths", async () => {
		const provider: SandboxProvider = {
			run: async (args) => {
				expect(args.command).toBe("python analyze.py");
				expect(args.files).toEqual([
					{ path: "/work/input.json", content: '{"ok":true}' },
				]);
				expect(args.returnFiles).toEqual(["/work/result.json"]);
				expect(args.timeoutMs).toBe(20_000);
				return {
					stdout: "done",
					stderr: "",
					exitCode: 0,
					timedOut: false,
					files: [{ path: "/work/result.json", content: '{"done":true}' }],
				};
			},
		};
		const tools = createSandboxTools({ provider });

		await expect(
			execute(tools.runSandboxCommand, {
				task: "analyze json",
				command: "python analyze.py",
				files: [{ path: "input.json", content: '{"ok":true}' }],
				returnFiles: ["result.json"],
			}),
		).resolves.toEqual({
			stdout: "done",
			stderr: "",
			exitCode: 0,
			timedOut: false,
			files: [{ path: "/work/result.json", content: '{"done":true}' }],
		});
	});

	test("rejects unsafe input before calling provider", async () => {
		let called = false;
		const provider: SandboxProvider = {
			run: async () => {
				called = true;
				throw new Error("should not run");
			},
		};
		const tools = createSandboxTools({ provider });

		await expect(
			execute(tools.runSandboxCommand, {
				task: "leak",
				command: "echo ok",
				files: [{ path: ".env", content: "API_KEY=secret" }],
			}),
		).rejects.toThrow();
		expect(called).toBe(false);
	});

	test("truncates provider output", async () => {
		const provider: SandboxProvider = {
			run: async () => ({
				stdout: "a".repeat(25 * 1024),
				stderr: "",
				timedOut: false,
				files: [{ path: "/work/out.txt", content: "b".repeat(25 * 1024) }],
			}),
		};
		const tools = createSandboxTools({ provider });
		const result = (await execute(tools.runSandboxCommand, {
			task: "large",
			command: "cat out.txt",
		})) as { stdout: string; files: Array<{ content: string }> };

		expect(result.stdout).toEndWith("[truncated]");
		expect(result.files[0]?.content).toEndWith("[truncated]");
	});
});
