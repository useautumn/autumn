import type {
	ApiVersion,
	AppEnv,
	CreateEntityParams,
	CustomerData,
} from "@autumn/shared";

export type EntityCreationRecoveryStage =
	| "lookup"
	| "customer_committed"
	| "entitlements_updating"
	| "seat_charge"
	| "entities_committed"
	| "completed";

/** Stages where a write is already in flight or done. Entity creation is not
 *  idempotent the way get-or-create is, so anything past validation is manual —
 *  as is a customer this request committed on its way through validation. */
export const ENTITY_CREATION_MANUAL_REVIEW_STAGES =
	new Set<EntityCreationRecoveryStage>([
		"customer_committed",
		"entitlements_updating",
		"seat_charge",
		"entities_committed",
	]);

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
	failureStage: EntityCreationRecoveryStage;
	failedAt: number;
}

export const isEntityCreationRecoveryPayload = (
	payload: unknown,
): payload is EntityCreationRecoveryPayload =>
	typeof payload === "object" &&
	payload !== null &&
	(payload as { kind?: unknown }).kind === "entity";
