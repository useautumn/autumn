import type {
	ApiVersion,
	AppEnv,
	CreateEntityParams,
	CustomerData,
} from "@autumn/shared";

export interface EntityCreationRecoveryPayload {
	kind: "entity";
	orgId: string;
	env: AppEnv;
	customerId: string;
	requestId: string;
	apiVersion: ApiVersion;
	params: {
		customer_id: string;
		create_entity_data: CreateEntityParams[];
		customer_data?: CustomerData;
	};
}

export const isEntityCreationRecoveryPayload = (
	payload: unknown,
): payload is EntityCreationRecoveryPayload =>
	typeof payload === "object" &&
	payload !== null &&
	(payload as { kind?: unknown }).kind === "entity";
