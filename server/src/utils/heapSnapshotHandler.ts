/**
 * Registers a SIGUSR2 handler that takes a heap snapshot
 * and sends it to Discord via webhook.
 *
 * Usage: kill -USR2 <pid>
 * Or trigger from the cluster primary via IPC.
 */

import { writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { logger } from "../external/logtail/logtailUtils.js";

const DISCORD_WEBHOOK_URL = process.env.DISCORD_FEEDBACK_WEBHOOK;

async function sendToDiscord(filePath: string, label: string) {
	if (!DISCORD_WEBHOOK_URL) {
		logger.warn("DISCORD_FEEDBACK_WEBHOOK not configured, cannot send heap snapshot");
		return;
	}

	const fileData = readFileSync(filePath);
	const filename = `heap-${label}-pid${process.pid}-${Date.now()}.heapsnapshot`;

	const mem = process.memoryUsage();
	const toMB = (b: number) => (b / 1024 / 1024).toFixed(1);

	const summary = [
		`**Heap Snapshot — ${label} (pid ${process.pid})**`,
		`RSS: ${toMB(mem.rss)}MB | Heap: ${toMB(mem.heapUsed)}/${toMB(mem.heapTotal)}MB`,
		`External: ${toMB(mem.external)}MB | ArrayBuffers: ${toMB(mem.arrayBuffers)}MB`,
		`File size: ${(fileData.length / 1024 / 1024).toFixed(1)}MB`,
		"Open in Chrome DevTools → Memory → Load",
	].join("\n");

	const formData = new FormData();
	formData.append("content", summary);
	formData.append(
		"files[0]",
		new Blob([fileData], { type: "application/json" }),
		filename,
	);

	try {
		const res = await fetch(DISCORD_WEBHOOK_URL, {
			method: "POST",
			body: formData,
		});

		if (!res.ok) {
			logger.error(`Failed to send heap snapshot to Discord: ${res.status} ${await res.text()}`);
		} else {
			logger.info(`Heap snapshot sent to Discord: ${filename}`);
		}
	} catch (err) {
		logger.error(`Failed to send heap snapshot to Discord: ${err}`);
	}
}

export function registerHeapSnapshotHandler(label: string) {
	process.on("SIGUSR2", async () => {
		logger.info(`SIGUSR2 received — generating heap snapshot for ${label} (pid ${process.pid})`);

		const snapshotPath = join(tmpdir(), `heap-${label}-${process.pid}-${Date.now()}.heapsnapshot`);

		try {
			if (typeof Bun !== "undefined" && typeof Bun.generateHeapSnapshot === "function") {
				const snapshot = Bun.generateHeapSnapshot();
				writeFileSync(snapshotPath, JSON.stringify(snapshot));
			} else {
				const v8 = await import("node:v8");
				v8.writeHeapSnapshot(snapshotPath);
			}

			await sendToDiscord(snapshotPath, label);

			// Clean up
			try {
				unlinkSync(snapshotPath);
			} catch {}
		} catch (err) {
			logger.error(`Failed to generate heap snapshot: ${err}`);
		}
	});

	logger.info(`[${label}] Heap snapshot handler registered (send SIGUSR2 to pid ${process.pid})`);
}
