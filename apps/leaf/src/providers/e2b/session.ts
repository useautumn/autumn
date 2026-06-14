import {
	HarnessCapabilityUnsupportedError,
	type HarnessV1NetworkPolicy,
	type HarnessV1NetworkSandboxSession,
} from "@ai-sdk/harness";
import type { Sandbox } from "e2b";
import { posix } from "node:path";
import { E2B_BRIDGE_PORT } from "./config.js";

// The non-network sandbox view (Experimental_SandboxSession), derived through the
// harness export so we need no direct @ai-sdk/provider-utils dependency.
export type RestrictedSandboxSession = ReturnType<
	HarnessV1NetworkSandboxSession["restricted"]
>;

const E2B_PROVIDER_ID = "e2b-sandbox";

type RunOptions = {
	command: string;
	workingDirectory?: string;
	env?: Record<string, string>;
	abortSignal?: AbortSignal;
};

const isFileNotFoundError = (error: unknown): boolean => {
	if (error == null || typeof error !== "object") return false;
	const message = (error as { message?: unknown }).message;
	return (
		typeof message === "string" &&
		/no such file|not found|does not exist|ENOENT/i.test(message)
	);
};

const extractLines = ({
	text,
	startLine,
	endLine,
}: {
	text: string;
	startLine?: number;
	endLine?: number;
}): string => {
	if (startLine == null && endLine == null) return text;
	const lines = text.split("\n");
	const start = startLine != null ? Math.max(1, startLine) : 1;
	const end = endLine != null ? Math.min(lines.length, endLine) : lines.length;
	return lines.slice(start - 1, end).join("\n");
};

const bytesToStream = (bytes: Uint8Array): ReadableStream<Uint8Array> =>
	new ReadableStream({
		start(controller) {
			controller.enqueue(bytes);
			controller.close();
		},
	});

const collectStream = async (
	stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> => {
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		if (value) {
			chunks.push(value);
			total += value.byteLength;
		}
	}
	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return out;
};

/**
 * The non-network sandbox view: run/spawn + file I/O. Mirrors the Vercel adapter
 * session shape so the claude-code harness drives it unchanged.
 */
export class E2bSandboxSession {
	constructor(
		protected readonly sandbox: Sandbox,
		readonly defaultWorkingDirectory: string,
	) {}

	get description(): string {
		return [
			`E2B Sandbox (id: ${this.sandbox.sandboxId}).`,
			"Filesystem changes persist for the lifetime of the sandbox.",
		].join("\n");
	}

	async run({ command, workingDirectory, env, abortSignal }: RunOptions) {
		abortSignal?.throwIfAborted();
		try {
			const result = await this.sandbox.commands.run(command, {
				...(workingDirectory ? { cwd: workingDirectory } : {}),
				...(env ? { envs: env } : {}),
			});
			return {
				exitCode: result.exitCode,
				stdout: result.stdout,
				stderr: result.stderr,
			};
		} catch (error) {
			// E2B throws CommandExitError on non-zero; the harness wants the code, not
			// an exception (it polls exit codes for bridge readiness).
			const exit = error as {
				exitCode?: number;
				stdout?: string;
				stderr?: string;
			};
			if (typeof exit?.exitCode === "number") {
				return {
					exitCode: exit.exitCode,
					stdout: exit.stdout ?? "",
					stderr: exit.stderr ?? "",
				};
			}
			throw error;
		}
	}

	async spawn({ command, workingDirectory, env, abortSignal }: RunOptions) {
		abortSignal?.throwIfAborted();
		const encoder = new TextEncoder();
		const controllers: {
			stdout?: ReadableStreamDefaultController<Uint8Array>;
			stderr?: ReadableStreamDefaultController<Uint8Array>;
		} = {};
		const stdout = new ReadableStream<Uint8Array>({
			start: (c) => {
				controllers.stdout = c;
			},
		});
		const stderr = new ReadableStream<Uint8Array>({
			start: (c) => {
				controllers.stderr = c;
			},
		});
		const handle = await this.sandbox.commands.run(command, {
			background: true,
			...(workingDirectory ? { cwd: workingDirectory } : {}),
			...(env ? { envs: env } : {}),
			onStdout: (data) => controllers.stdout?.enqueue(encoder.encode(data)),
			onStderr: (data) => controllers.stderr?.enqueue(encoder.encode(data)),
		});
		const closeStreams = () => {
			try {
				controllers.stdout?.close();
			} catch {}
			try {
				controllers.stderr?.close();
			} catch {}
		};
		return {
			stdout,
			stderr,
			wait: async () => {
				try {
					const result = await handle.wait();
					closeStreams();
					return { exitCode: result.exitCode };
				} catch (error) {
					closeStreams();
					const exit = error as { exitCode?: number };
					if (typeof exit?.exitCode === "number") {
						return { exitCode: exit.exitCode };
					}
					throw error;
				}
			},
			kill: async () => {
				await handle.kill().catch(() => undefined);
				closeStreams();
			},
		};
	}

	async readFile({ path, abortSignal }: { path: string; abortSignal?: AbortSignal }) {
		const bytes = await this.readBinaryFile({ path, abortSignal });
		return bytes == null ? null : bytesToStream(bytes);
	}

	async readBinaryFile({
		path,
		abortSignal,
	}: {
		path: string;
		abortSignal?: AbortSignal;
	}): Promise<Uint8Array | null> {
		abortSignal?.throwIfAborted();
		try {
			return await this.sandbox.files.read(path, { format: "bytes" });
		} catch (error) {
			if (isFileNotFoundError(error)) return null;
			throw error;
		}
	}

	async readTextFile({
		path,
		encoding = "utf-8",
		startLine,
		endLine,
		abortSignal,
	}: {
		path: string;
		encoding?: string;
		startLine?: number;
		endLine?: number;
		abortSignal?: AbortSignal;
	}): Promise<string | null> {
		const bytes = await this.readBinaryFile({ path, abortSignal });
		if (bytes == null) return null;
		const text = Buffer.from(bytes).toString(encoding as BufferEncoding);
		return extractLines({ text, startLine, endLine });
	}

	async writeFile({
		path,
		content,
		abortSignal,
	}: {
		path: string;
		content: ReadableStream<Uint8Array>;
		abortSignal?: AbortSignal;
	}) {
		const bytes = await collectStream(content);
		await this.writeBinaryFile({ path, content: bytes, abortSignal });
	}

	async writeBinaryFile({
		path,
		content,
		abortSignal,
	}: {
		path: string;
		content: Uint8Array;
		abortSignal?: AbortSignal;
	}) {
		abortSignal?.throwIfAborted();
		const parent = posix.dirname(path);
		if (parent && parent !== "." && parent !== "/") {
			await this.sandbox.commands
				.run(`mkdir -p ${parent}`)
				.catch(() => undefined);
		}
		const buffer = content.buffer.slice(
			content.byteOffset,
			content.byteOffset + content.byteLength,
		) as ArrayBuffer;
		await this.sandbox.files.write(path, buffer);
	}

	async writeTextFile({
		path,
		content,
		encoding = "utf-8",
		abortSignal,
	}: {
		path: string;
		content: string;
		encoding?: string;
		abortSignal?: AbortSignal;
	}) {
		const buffer = Buffer.from(content, encoding as BufferEncoding);
		await this.writeBinaryFile({
			path,
			content: new Uint8Array(
				buffer.buffer,
				buffer.byteOffset,
				buffer.byteLength,
			),
			abortSignal,
		});
	}
}

/**
 * The network sandbox view: adds getPortUrl (E2B public host → WS for the bridge),
 * egress control (updateNetwork), and lifecycle. E2B hosts are publicly routable
 * but the bridge's channel token gates access (same posture as Vercel/Daytona).
 */
export class E2bNetworkSandboxSession
	extends E2bSandboxSession
	implements HarnessV1NetworkSandboxSession
{
	readonly id: string;
	private readonly ownsLifecycle: boolean;

	constructor(input: {
		sandbox: Sandbox;
		defaultWorkingDirectory: string;
		ownsLifecycle: boolean;
	}) {
		super(input.sandbox, input.defaultWorkingDirectory);
		this.id = input.sandbox.sandboxId;
		this.ownsLifecycle = input.ownsLifecycle;
	}

	get ports(): number[] {
		return [E2B_BRIDGE_PORT];
	}

	getPortUrl = async (options: {
		port: number;
		protocol?: "http" | "https" | "ws" | "wss";
	}): Promise<string> => {
		if (!this.ports.includes(options.port)) {
			throw new HarnessCapabilityUnsupportedError({
				harnessId: E2B_PROVIDER_ID,
				message: `Port ${options.port} is not exposed on this sandbox. Exposed ports: [${this.ports.join(", ")}].`,
			});
		}
		const host = this.sandbox.getHost(options.port);
		const url = new URL(`https://${host}`);
		switch (options.protocol ?? "https") {
			case "http":
				url.protocol = "http:";
				break;
			case "https":
				url.protocol = "https:";
				break;
			case "ws":
			case "wss":
				url.protocol = "wss:";
				break;
		}
		return url.toString();
	};

	setNetworkPolicy = async (policy: HarnessV1NetworkPolicy): Promise<void> => {
		switch (policy.mode) {
			case "allow-all":
				await this.sandbox.updateNetwork({ allowInternetAccess: true });
				return;
			case "deny-all":
				await this.sandbox.updateNetwork({ allowInternetAccess: false });
				return;
			case "custom": {
				const allowOut = [
					...(policy.allowedHosts ?? []),
					...(policy.allowedCIDRs ?? []),
				];
				await this.sandbox.updateNetwork({
					...(allowOut.length > 0 ? { allowOut } : {}),
					...(policy.deniedCIDRs && policy.deniedCIDRs.length > 0
						? { denyOut: [...policy.deniedCIDRs] }
						: {}),
				});
				return;
			}
		}
	};

	stop = async (): Promise<void> => {
		if (!this.ownsLifecycle) return;
		await this.sandbox.kill();
	};

	destroy = async (): Promise<void> => {
		if (!this.ownsLifecycle) return;
		await this.sandbox.kill();
	};

	restricted(): RestrictedSandboxSession {
		return new E2bSandboxSession(this.sandbox, this.defaultWorkingDirectory);
	}
}

export const buildE2bNetworkSession = async (input: {
	sandbox: Sandbox;
	ownsLifecycle: boolean;
}): Promise<E2bNetworkSandboxSession> => {
	const pwd = await input.sandbox.commands
		.run("pwd")
		.then((r) => r.stdout.trim())
		.catch(() => "");
	return new E2bNetworkSandboxSession({
		sandbox: input.sandbox,
		defaultWorkingDirectory: pwd || "/home/user",
		ownsLifecycle: input.ownsLifecycle,
	});
};
