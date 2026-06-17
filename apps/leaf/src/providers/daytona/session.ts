import {
	HarnessCapabilityUnsupportedError,
	type HarnessV1NetworkPolicy,
	type HarnessV1NetworkSandboxSession,
} from "@ai-sdk/harness";
import type { Sandbox } from "@daytonaio/sdk";
import { posix } from "node:path";
import { DAYTONA_BRIDGE_PORT } from "./config.js";

// The non-network sandbox view (Experimental_SandboxSession) as exported through
// the harness, so we don't need a direct @ai-sdk/provider-utils dependency.
export type RestrictedSandboxSession = ReturnType<
	HarnessV1NetworkSandboxSession["restricted"]
>;

const DAYTONA_PROVIDER_ID = "daytona-sandbox";
const SESSION_POLL_INTERVAL_MS = 400;

// 1-based inclusive line slice; mirrors @ai-sdk/provider-utils' extractLines.
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

type RunOptions = {
	command: string;
	workingDirectory?: string;
	env?: Record<string, string>;
	abortSignal?: AbortSignal;
};

const isFileNotFoundError = (error: unknown): boolean => {
	if (error == null || typeof error !== "object") return false;
	const code = (error as { code?: unknown }).code;
	if (code === "ENOENT" || code === 404) return true;
	const status = (error as { statusCode?: unknown }).statusCode;
	if (status === 404) return true;
	const message = (error as { message?: unknown }).message;
	return (
		typeof message === "string" &&
		/no such file|not found|does not exist|ENOENT/i.test(message)
	);
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

// Session commands carry no env field, so bake env into the command line.
const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
const shellEnvPrefix = (env?: Record<string, string>): string => {
	if (!env) return "";
	const pairs = Object.entries(env).map(
		([key, value]) => `${key}=${shellQuote(value)}`,
	);
	return pairs.length ? `${pairs.join(" ")} ` : "";
};

/**
 * The non-network sandbox view: run/spawn + file I/O. Mirrors the Vercel
 * adapter's session shape so the claude-code harness drives it unchanged.
 */
export class DaytonaSandboxSession {
	constructor(
		protected readonly sandbox: Sandbox,
		readonly defaultWorkingDirectory: string,
	) {}

	get description(): string {
		return [
			`Daytona Sandbox (id: ${this.sandbox.id}).`,
			"Filesystem changes persist for the lifetime of the sandbox.",
		].join("\n");
	}

	async run({ command, workingDirectory, env, abortSignal }: RunOptions) {
		abortSignal?.throwIfAborted();
		const response = await this.sandbox.process.executeCommand(
			command,
			workingDirectory,
			env,
		);
		return {
			exitCode: response.exitCode ?? 0,
			stdout: response.result ?? "",
			stderr: "",
		};
	}

	async spawn({ command, workingDirectory, env, abortSignal }: RunOptions) {
		abortSignal?.throwIfAborted();
		const sessionId = `bridge-${crypto.randomUUID()}`;
		await this.sandbox.process.createSession(sessionId);
		const cwdPrefix = workingDirectory ? `cd ${shellQuote(workingDirectory)} && ` : "";
		const { cmdId } = await this.sandbox.process.executeSessionCommand(
			sessionId,
			{ command: `${cwdPrefix}${shellEnvPrefix(env)}${command}`, runAsync: true },
		);
		return this.createSandboxProcess({ cmdId, sessionId, abortSignal });
	}

	private createSandboxProcess({
		cmdId,
		sessionId,
		abortSignal,
	}: {
		cmdId: string;
		sessionId: string;
		abortSignal?: AbortSignal;
	}) {
		const encoder = new TextEncoder();
		const controllers: {
			stdout?: ReadableStreamDefaultController<Uint8Array>;
			stderr?: ReadableStreamDefaultController<Uint8Array>;
		} = {};
		const stdout = new ReadableStream<Uint8Array>({
			start: (controller) => {
				controllers.stdout = controller;
			},
		});
		const stderr = new ReadableStream<Uint8Array>({
			start: (controller) => {
				controllers.stderr = controller;
			},
		});
		const drained = this.sandbox.process
			.getSessionCommandLogs(
				sessionId,
				cmdId,
				(chunk) => controllers.stdout?.enqueue(encoder.encode(chunk)),
				(chunk) => controllers.stderr?.enqueue(encoder.encode(chunk)),
			)
			.then(
				() => {
					controllers.stdout?.close();
					controllers.stderr?.close();
				},
				(error) => {
					controllers.stdout?.error(error);
					controllers.stderr?.error(error);
				},
			);
		return {
			stdout,
			stderr,
			wait: async () => {
				while (true) {
					abortSignal?.throwIfAborted();
					const command = await this.sandbox.process.getSessionCommand(
						sessionId,
						cmdId,
					);
					if (command.exitCode != null) {
						await drained.catch(() => undefined);
						return { exitCode: command.exitCode };
					}
					await new Promise((resolve) =>
						setTimeout(resolve, SESSION_POLL_INTERVAL_MS),
					);
				}
			},
			kill: async () => {
				await this.sandbox.process.deleteSession(sessionId).catch(() => undefined);
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
			const buffer = await this.sandbox.fs.downloadFile(path);
			if (buffer == null) return null;
			return new Uint8Array(
				buffer.buffer,
				buffer.byteOffset,
				buffer.byteLength,
			);
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
			await this.sandbox.fs.createFolder(parent, "755").catch(() => undefined);
		}
		await this.sandbox.fs.uploadFile(Buffer.from(content), path);
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
 * The network sandbox view: adds getPortUrl (signed Daytona preview → WS for the
 * bridge), egress control (updateNetworkSettings), and lifecycle. The bridge
 * port is reachable because the sandbox is created `public`, mirroring Vercel's
 * publicly-routable-but-bridge-token-gated posture.
 */
export class DaytonaNetworkSandboxSession
	extends DaytonaSandboxSession
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
		this.id = input.sandbox.id;
		this.ownsLifecycle = input.ownsLifecycle;
	}

	get ports(): number[] {
		return [DAYTONA_BRIDGE_PORT];
	}

	getPortUrl = async (options: {
		port: number;
		protocol?: "http" | "https" | "ws" | "wss";
	}): Promise<string> => {
		if (!this.ports.includes(options.port)) {
			throw new HarnessCapabilityUnsupportedError({
				harnessId: DAYTONA_PROVIDER_ID,
				message: `Port ${options.port} is not exposed on this sandbox. Exposed ports: [${this.ports.join(", ")}].`,
			});
		}
		const preview = await this.sandbox.getPreviewLink(options.port);
		const url = new URL(preview.url);
		const protocol = options.protocol ?? "https";
		const isSecure = url.protocol === "https:";
		switch (protocol) {
			case "http":
				url.protocol = isSecure ? "https:" : "http:";
				break;
			case "https":
				url.protocol = "https:";
				break;
			case "ws":
				url.protocol = isSecure ? "wss:" : "ws:";
				break;
			case "wss":
				url.protocol = "wss:";
				break;
		}
		return url.toString();
	};

	setNetworkPolicy = async (policy: HarnessV1NetworkPolicy): Promise<void> => {
		switch (policy.mode) {
			case "allow-all":
				await this.sandbox.updateNetworkSettings({ networkBlockAll: false });
				return;
			case "deny-all":
				await this.sandbox.updateNetworkSettings({ networkBlockAll: true });
				return;
			case "custom": {
				// Daytona egress is CIDR-only; hostname allowlists can't be expressed,
				// so a host-only policy falls back to open egress.
				if (policy.allowedCIDRs && policy.allowedCIDRs.length > 0) {
					await this.sandbox.updateNetworkSettings({
						networkAllowList: policy.allowedCIDRs.join(","),
					});
					return;
				}
				await this.sandbox.updateNetworkSettings({ networkBlockAll: false });
				return;
			}
		}
	};

	stop = async (): Promise<void> => {
		if (!this.ownsLifecycle) return;
		await this.sandbox.stop();
	};

	destroy = async (): Promise<void> => {
		if (!this.ownsLifecycle) return;
		await this.sandbox.stop().catch(() => undefined);
		await this.sandbox.delete();
	};

	restricted(): RestrictedSandboxSession {
		return new DaytonaSandboxSession(this.sandbox, this.defaultWorkingDirectory);
	}
}

export const buildDaytonaNetworkSession = async (input: {
	sandbox: Sandbox;
	ownsLifecycle: boolean;
}): Promise<DaytonaNetworkSandboxSession> => {
	const workDir = (await input.sandbox.getWorkDir()) ?? "/home/daytona";
	return new DaytonaNetworkSandboxSession({
		sandbox: input.sandbox,
		defaultWorkingDirectory: workDir,
		ownsLifecycle: input.ownsLifecycle,
	});
};
