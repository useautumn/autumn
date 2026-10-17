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
	releasedAt: z.string().nullable(),
});
type PermitRecord = z.infer<typeof PermitRecordSchema>;

export function createStepDownPermits({
	ctx,
	config,
}: {
	ctx: { objects: AdminBucketObjects; now?: () => number };
	config: { scope: string; holder: string; slots: number };
}): StepDownPermits {
	const now = ctx.now ?? Date.now;
	const { objects } = ctx;

	function keyOf(slot: number): string {
		return `${STEP_DOWN_PERMIT_PREFIX}/${config.scope}/slot-${slot}.json`;
	}

	function heldRecord(): PermitRecord {
		return {
			holder: config.holder,
			acquisitionId: crypto.randomUUID(),
			acquiredAt: new Date(now()).toISOString(),
			releasedAt: null,
		};
	}

	function recordOf(object: AdminObject): PermitRecord | null {
		try {
			return PermitRecordSchema.safeParse(JSON.parse(object.text)).data ?? null;
		} catch {
			return null;
		}
	}

	async function takeSlot({
		key,
	}: {
		key: string;
	}): Promise<PermitRecord | null> {
		const fresh = heldRecord();
		if (await objects.create({ key, body: JSON.stringify(fresh) }))
			return fresh;
		const existing = await objects.read({ key });
		if (existing === null)
			return (await objects.create({ key, body: JSON.stringify(fresh) }))
				? fresh
				: null;
		const record = recordOf(existing);
		if (record === null) return null;
		if (record.releasedAt === null)
			return record.holder === config.holder ? record : null;
		const taken = await objects.replace({
			key,
			body: JSON.stringify(fresh),
			etag: existing.etag,
		});
		return taken ? fresh : null;
	}

	async function acquire(): Promise<StepDownPermitResult> {
		for (let slot = 0; slot < config.slots; slot++) {
			const key = keyOf(slot);
			try {
				const held = await takeSlot({ key });
				if (held)
					return {
						ok: true,
						permit: { slot, key, acquisitionId: held.acquisitionId },
					};
			} catch (cause) {
				return { ok: false, reason: "unavailable", cause };
			}
		}
		return { ok: false, reason: "all_taken" };
	}

	async function release({
		permit,
	}: {
		permit: StepDownPermit;
	}): Promise<void> {
		const existing = await objects.read({ key: permit.key });
		if (existing === null) return;
		const record = recordOf(existing);
		if (record?.holder !== config.holder) return;
		if (record.acquisitionId !== permit.acquisitionId) return;
		if (record.releasedAt !== null) return;
		await objects.replace({
			key: permit.key,
			body: JSON.stringify({
				...record,
				releasedAt: new Date(now()).toISOString(),
			} satisfies PermitRecord),
			etag: existing.etag,
		});
	}

	return { acquire, release };
}
