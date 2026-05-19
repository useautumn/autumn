import { spawn } from "node:child_process";

export type RunOptions = {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	stdio?: "inherit" | "pipe";
};

export type RunResult = {
	code: number;
	stdout: string;
	stderr: string;
};

export function run(
	cmd: string,
	args: readonly string[],
	options: RunOptions = {},
): Promise<RunResult> {
	const { cwd, env, stdio = "inherit" } = options;
	return new Promise((resolve) => {
		const child = spawn(cmd, [...args], {
			cwd,
			env: env ?? process.env,
			stdio: stdio === "inherit" ? "inherit" : ["ignore", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";
		if (stdio === "pipe") {
			child.stdout?.on("data", (chunk: Buffer) => {
				stdout += chunk.toString();
			});
			child.stderr?.on("data", (chunk: Buffer) => {
				stderr += chunk.toString();
			});
		}

		child.on("close", (code) => {
			resolve({ code: code ?? 1, stdout, stderr });
		});
		child.on("error", (err) => {
			resolve({ code: 1, stdout, stderr: stderr + err.message });
		});
	});
}
