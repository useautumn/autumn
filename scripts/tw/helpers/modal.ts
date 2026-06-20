/**
 * Modal backend for the provider seam (helpers/provider.ts).
 *
 * STATUS: Phase B — not yet implemented. Phase A wired the `--provider` seam and
 * the Vercel adapter (a safe no-op). This module will implement `ProviderImpl`
 * over the `modal` SDK using the patterns proven in `scripts/tw/modal-spike/`:
 *   - base image = published Debian services image (PG18 + Dragonfly + goaws + bun)
 *   - createWarmSandbox → modal.sandboxes.create(app, baseImage, …)
 *   - runStreaming/runDetached → sb.exec(…)
 *   - snapshotAndStop → sb.snapshotFilesystem() (returns the warm Image)
 *   - forkWorker → create from the warm snapshot Image (paced for the 5/s limit)
 *   - getPublicUrl → sb.tunnels()[port].url ; deleteSandbox → sb.terminate()
 *   - listSandboxesByOwner → modal.sandboxes.list({ tags })
 *
 * Until then, selecting `--provider=modal` fails fast with a clear message.
 */
import type { ProviderImpl } from "./provider.ts";

const notImplemented = (): never => {
	throw new Error(
		"--provider=modal is not yet implemented (Phase B). Run with --provider=vercel (the default).",
	);
};

export const modalProvider: ProviderImpl = {
	createWarmSandbox: notImplemented,
	createIngressSandbox: notImplemented,
	forkWorker: notImplemented,
	snapshotAndStop: notImplemented,
	getPublicUrl: notImplemented,
	getSandboxByName: notImplemented,
	deleteSandbox: notImplemented,
	runStreaming: notImplemented,
	runDetached: notImplemented,
	listSandboxesByOwner: notImplemented,
	isSandboxStreamClosed: () => false,
};
