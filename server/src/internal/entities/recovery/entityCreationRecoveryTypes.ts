import type {
	ApiVersion,
	AppEnv,
	CreateEntityParams,
	CustomerData,
} from "@autumn/shared";

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
	source?: string;
	withAutumnId?: boolean;
	/** The create reached the point where a failure can leave a decremented
	 *  balance or an entity whose defaults never attached, neither of which a
	 *  later read can detect. Such a capture is never replayed automatically.
	 *  Optional on the wire: only an explicit `false` is treated as safe. */
	mayHaveWritten?: boolean;
	failedAt: number;
}

export const isEntityCreationRecoveryPayload = (
	payload: unknown,
): payload is EntityCreationRecoveryPayload =>
	typeof payload === "object" &&
	payload !== null &&
	(payload as { kind?: unknown }).kind === "entity";
