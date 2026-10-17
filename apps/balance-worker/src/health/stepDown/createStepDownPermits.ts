import { z } from "zod/v4";
import type { AdminBucketObjects } from "../../external/s3/types/adminBucketObjects.js";
import type {
	StepDownPermitResult,
	StepDownPermits,
} from "./types/stepDownPermits.js";

const STEP_DOWN_PERMIT_PREFIX = "admin/balance-worker-step-down";

const PermitRecordSchema = z.object({
	holder: z.string(),
	acquiredAt: z.string(),
	expiresAt: z.string(),
});

export function createStepDownPermits({
	ctx,
	config,
}: {
	ctx: { objects: AdminBucketObjects; now?: () => number };
	config: { deployment: string; holder: string; slots: number; ttlMs: number };
}): StepDownPermits {
	const now = ctx.now ?? Date.now;
	const { objects } = ctx;

	function keyOf(slot: number): string {
		return `${STEP_DOWN_PERMIT_PREFIX}/${config.deployment}/slot-${slot}.json`;
	}

	function recordBody(): string {
		const at = now();
		return JSON.stringify({
			holder: config.holder,
			acquiredAt: new Date(at).toISOString(),
			expiresAt: new Date(at + config.ttlMs).toISOString(),
		});
	}

	function holderOf(text: string) {
		try {
			return PermitRecordSchema.safeParse(JSON.parse(text)).data ?? null;
		} catch {
			return null;
		}
	}

	async function takeSlot({ key }: { key: string }): Promise<boolean> {
		if (await objects.create({ key, body: recordBody() })) return true;
		const existing = await objects.read({ key });
		if (existing === null) return objects.create({ key, body: recordBody() });
		const held = holderOf(existing.text);
		if (held?.holder === config.holder) return true;
		if (held && Date.parse(held.expiresAt) > now()) return false;
		return objects.replace({ key, body: recordBody(), etag: existing.etag });
	}

	async function acquire(): Promise<StepDownPermitResult> {
		for (let slot = 0; slot < config.slots; slot++) {
			const key = keyOf(slot);
			try {
				if (await takeSlot({ key })) return { ok: true, permit: { slot, key } };
			} catch (cause) {
				return { ok: false, reason: "unavailable", cause };
			}
		}
		return { ok: false, reason: "all_taken" };
	}

	async function release({
		permit,
	}: {
		permit: { key: string };
	}): Promise<void> {
		const existing = await objects.read({ key: permit.key });
		if (existing === null) return;
		if (holderOf(existing.text)?.holder !== config.holder) return;
		await objects.remove({ key: permit.key });
	}

	return { acquire, release };
}
