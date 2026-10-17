import { z } from "zod/v4";
import type {
	AdminBucketObjects,
	AdminObject,
} from "../../external/s3/types/adminBucketObjects.js";
import type {
	StepDownPermit,
	StepDownPermitResult,
	StepDownPermits,
} from "./types/stepDownPermits.js";

const STEP_DOWN_PERMIT_PREFIX = "admin/balance-worker-step-down";

const PermitRecordSchema = z.object({
	holder: z.string(),
	acquisitionId: z.string(),
	acquiredAt: z.string(),
	expiresAt: z.string(),
	releasedAt: z.string().nullable(),
});
type PermitRecord = z.infer<typeof PermitRecordSchema>;

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

	function heldRecord(): string {
		const at = now();
		return JSON.stringify({
			holder: config.holder,
			acquisitionId: crypto.randomUUID(),
			acquiredAt: new Date(at).toISOString(),
			expiresAt: new Date(at + config.ttlMs).toISOString(),
			releasedAt: null,
		} satisfies PermitRecord);
	}

	function recordOf(object: AdminObject): PermitRecord | null {
		try {
			return PermitRecordSchema.safeParse(JSON.parse(object.text)).data ?? null;
		} catch {
			return null;
		}
	}

	function isFree(record: PermitRecord): boolean {
		return record.releasedAt !== null || Date.parse(record.expiresAt) <= now();
	}

	function isOurs(record: PermitRecord | null): record is PermitRecord {
		return (
			record !== null &&
			record.holder === config.holder &&
			record.releasedAt === null
		);
	}

	async function takeSlot({ key }: { key: string }): Promise<boolean> {
		if (await objects.create({ key, body: heldRecord() })) return true;
		const existing = await objects.read({ key });
		if (existing === null) return objects.create({ key, body: heldRecord() });
		const record = recordOf(existing);
		if (record === null) return false;
		if (isOurs(record) && !isFree(record)) return true;
		if (!isFree(record)) return false;
		return objects.replace({ key, body: heldRecord(), etag: existing.etag });
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

	async function renew({
		permit,
	}: {
		permit: StepDownPermit;
	}): Promise<boolean> {
		const existing = await objects.read({ key: permit.key });
		if (existing === null) return false;
		const record = recordOf(existing);
		if (!isOurs(record)) return false;
		const renewed: PermitRecord = {
			...record,
			expiresAt: new Date(now() + config.ttlMs).toISOString(),
		};
		return objects.replace({
			key: permit.key,
			body: JSON.stringify(renewed),
			etag: existing.etag,
		});
	}

	async function release({
		permit,
	}: {
		permit: StepDownPermit;
	}): Promise<void> {
		const existing = await objects.read({ key: permit.key });
		if (existing === null) return;
		const record = recordOf(existing);
		if (!isOurs(record)) return;
		const released: PermitRecord = {
			...record,
			releasedAt: new Date(now()).toISOString(),
		};
		await objects.replace({
			key: permit.key,
			body: JSON.stringify(released),
			etag: existing.etag,
		});
	}

	return { acquire, renew, release };
}
