import path from "node:path";
import type { SandboxFile, SandboxRunResult } from "../types.js";

export const sandboxLimits = {
	maxFiles: 5,
	maxInputBytes: 256 * 1024,
	maxOutputBytes: 24 * 1024,
	maxReturnedFileBytes: 24 * 1024,
	timeoutMs: 20_000,
	workDir: "/work",
};

const secretPatterns = [
	/\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/i,
	/\bxox[baprs]-[A-Za-z0-9-]{10,}/i,
	/\bsk_(?:live|test|proj)?_[A-Za-z0-9]{12,}/i,
	/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
	/^\s*[A-Z0-9_]*(?:SECRET|TOKEN|API_KEY|PASSWORD)[A-Z0-9_]*\s*=\s*\S+/im,
];

/** Defense-in-depth: true if text matches a known secret/token shape. */
export const containsSecret = (value: string) =>
	secretPatterns.some((pattern) => pattern.test(value));

const byteLength = (value: string) => Buffer.byteLength(value, "utf8");

const assertNoSecrets = (value: string) => {
	if (containsSecret(value)) {
		throw new Error("Sandbox input appears to contain a secret or token");
	}
};

const normalizePath = (filePath: string) => {
	const normalized = path.posix.normalize(
		filePath.startsWith("/")
			? filePath
			: path.posix.join(sandboxLimits.workDir, filePath),
	);
	if (
		normalized !== sandboxLimits.workDir &&
		!normalized.startsWith(`${sandboxLimits.workDir}/`)
	) {
		throw new Error("Sandbox files must stay under /work");
	}
	if (path.posix.basename(normalized).toLowerCase() === ".env") {
		throw new Error("Sandbox files cannot be named .env");
	}
	return normalized;
};

export const sanitizeSandboxFiles = (files: SandboxFile[] = []) => {
	if (files.length > sandboxLimits.maxFiles) {
		throw new Error(
			`Sandbox input cannot exceed ${sandboxLimits.maxFiles} files`,
		);
	}

	let bytes = 0;
	const sanitized = files.map((file) => {
		assertNoSecrets(file.path);
		assertNoSecrets(file.content);
		bytes += byteLength(file.content);
		if (bytes > sandboxLimits.maxInputBytes) {
			throw new Error("Sandbox input is too large");
		}
		return {
			path: normalizePath(file.path),
			content: file.content,
		};
	});

	const seen = new Set<string>();
	for (const file of sanitized) {
		if (seen.has(file.path))
			throw new Error(`Duplicate sandbox file: ${file.path}`);
		seen.add(file.path);
	}
	return sanitized;
};

export const sanitizeReturnFiles = (returnFiles: string[] = []) =>
	returnFiles.map(normalizePath);

export const assertSafeSandboxCommand = (command: string) => {
	if (!command.trim()) throw new Error("Sandbox command cannot be empty");
	assertNoSecrets(command);
	return command.trim();
};

export const truncateText = (value: string, maxBytes: number) => {
	if (byteLength(value) <= maxBytes) return value;
	let output = "";
	for (const char of value) {
		if (byteLength(`${output}${char}`) > maxBytes) break;
		output += char;
	}
	return `${output}\n[truncated]`;
};

export const truncateSandboxResult = (
	result: SandboxRunResult,
): SandboxRunResult => ({
	...result,
	stdout: truncateText(result.stdout, sandboxLimits.maxOutputBytes),
	stderr: truncateText(result.stderr, sandboxLimits.maxOutputBytes),
	files: result.files.map((file) => ({
		path: file.path,
		content: truncateText(file.content, sandboxLimits.maxReturnedFileBytes),
	})),
});
