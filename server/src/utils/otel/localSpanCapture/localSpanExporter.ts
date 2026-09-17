import { randomBytes } from "node:crypto";
import {
	appendFileSync,
	closeSync,
	mkdirSync,
	openSync,
	realpathSync,
} from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import { serializeLocalSpan } from "./serializeLocalSpan.js";

export class LocalSpanExporter implements SpanExporter {
	readonly filePath: string;
	private readonly descriptor: number;
	private closed = false;

	constructor({ directory }: { directory: string }) {
		const resolvedDirectory = resolve(directory);
		if (
			!isAbsolute(directory) ||
			resolvedDirectory === "/tmp" ||
			resolvedDirectory.startsWith("/tmp/")
		) {
			throw new Error(
				"Local span capture requires an absolute non-/tmp directory",
			);
		}
		mkdirSync(resolvedDirectory, { recursive: true, mode: 0o700 });
		const realDirectory = realpathSync(resolvedDirectory);
		if (realDirectory === "/tmp" || realDirectory.startsWith("/tmp/")) {
			throw new Error(
				"Local span capture directory must not resolve into /tmp",
			);
		}
		this.filePath = join(
			realDirectory,
			`spans-${process.pid}-${Date.now()}-${randomBytes(6).toString("hex")}.jsonl`,
		);
		this.descriptor = openSync(this.filePath, "wx", 0o600);
	}

	export(
		spans: ReadableSpan[],
		callback: Parameters<SpanExporter["export"]>[1],
	): void {
		try {
			if (this.closed) throw new Error("Local span exporter is closed");
			const lines = spans.map((span) =>
				JSON.stringify(serializeLocalSpan({ span })),
			);
			if (lines.length)
				appendFileSync(this.descriptor, `${lines.join("\n")}\n`);
		} catch {
			callback({
				code: 1,
				error: new Error("Local span capture write failed"),
			});
			return;
		}
		callback({ code: 0 });
	}

	async shutdown(): Promise<void> {
		if (this.closed) return;
		this.closed = true;
		closeSync(this.descriptor);
	}
}
