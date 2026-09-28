/** The admin bucket as a directory: one file per key, so the orchestrator writes the slot record with plain fs. */
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { EdgeConfigS3Client } from "@autumn/edge-config";

export function createDirectoryEdgeConfigClient({
	directory,
}: {
	directory: string;
}): EdgeConfigS3Client {
	return {
		send: async (command) => {
			const { Key, Body } = command.input as { Key?: string; Body?: string };
			if (!Key) throw new Error("Edge config command requires a Key");
			const path = join(directory, Key);
			if (Body === undefined) {
				if (!existsSync(path)) {
					const missing = new Error(`No such key: ${Key}`);
					missing.name = "NoSuchKey";
					throw missing;
				}
				const text = await Bun.file(path).text();
				return { Body: { transformToString: async () => text } };
			}
			mkdirSync(dirname(path), { recursive: true });
			await Bun.write(path, Body);
			return {};
		},
	};
}
