import type { CheckCommand } from "@autumn/balance-engine";
import type { ApiVersionClass, CheckParams, CheckQuery } from "@autumn/shared";

export type CheckRequest = {
	requestId: string;
	occurredAt: number;
	params: CheckParams;
	query: CheckQuery;
	apiVersion: ApiVersionClass | null;
};

export type AnswerableCheck = {
	requestId: string;
	occurredAt: number;
	customerId: string;
	entityId: string | null;
	featureId: string;
	requiredBalance: number;
	properties: CheckCommand["properties"];
	query: CheckQuery;
	apiVersion: ApiVersionClass;
};
