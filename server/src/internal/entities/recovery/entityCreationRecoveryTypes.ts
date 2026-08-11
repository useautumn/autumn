import type {
	ApiVersion,
	AppEnv,
	CreateEntityParams,
	CustomerData,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

/** Marks on the request context that the create passed the point where it can
 *  first mutate. Read by the capture, and by a replay deciding whether its own
 *  attempt is safe to redeliver. */
export const ENTITY_CREATION_WROTE_KEY = "entityCreationWrote";

export const entityCreationWrote = ({ ctx }: { ctx: AutumnContext }) =>
	ctx.extraLogs[ENTITY_CREATION_WROTE_KEY] === true;

export interface EntityCreationRecoveryParams {
	customer_id: string;
	create_entity_data: CreateEntityParams[];
	customer_data?: CustomerData;
}

/** Entity captures ride the customer creation recovery queue, so they carry a
 *  discriminator. Payloads without one are customer captures — the original
 *  shape, still in flight when this shipped. */
export interface EntityCreationRecoveryPayload {
	kind: "entity";
	orgId: string;
	env: AppEnv;
	customerId: string;
	requestId: string;
	apiVersion: ApiVersion;
	params: EntityCreationRecoveryParams;
	/** The create reached the point where a failure can leave a decremented
	 *  balance or an entity whose defaults never attached, neither of which a
	 *  later read can detect. Such a capture is never replayed automatically.
	 *  Optional on the wire: only an explicit `false` is treated as safe. */
	mayHaveWritten?: boolean;
}

export const isEntityCreationRecoveryPayload = (
	payload: unknown,
): payload is EntityCreationRecoveryPayload =>
	typeof payload === "object" &&
	payload !== null &&
	(payload as { kind?: unknown }).kind === "entity";
