import type { MutationRecord, TrackCommand } from "@autumn/balance-engine";
import {
	AppEnv,
	buildAiCreditCostProperty,
	type EventInsert,
	type TrackDeduction,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { z } from "zod/v4";
import type { StreamRecord } from "../../../stream/types/streamConsumer.js";

const appEnvSchema = z.enum(AppEnv);

export const positionToUsageEventId = ({
	position,
}: {
	position: StreamRecord["position"];
}): string => `${position.topic}:${position.partition}:${position.offset}`;

type ReportedUsage = {
	orgSlug: string | undefined;
	eventName: string;
	eventId: string | null;
	idempotencyKey: string | null;
	value: number;
	properties: Record<string, unknown> | null;
	deductions: EventInsert["deductions"];
	internalProductId: string | null;
};

const trackPropertiesOf = ({
	command,
	deductions,
}: {
	command: TrackCommand;
	deductions: TrackDeduction[];
}): Record<string, unknown> | null => {
	if (!command.usageEvent?.recordsCreditCost) return command.properties;
	const creditCost = buildAiCreditCostProperty({
		aiCreditFeatureId: command.featureId,
		entries: deductions.map(({ feature_id, value }) => ({
			featureId: feature_id,
			amount: value,
		})),
	});
	return creditCost
		? { ...command.properties, credit_cost: creditCost }
		: command.properties;
};

const recordToReportedUsage = ({
	record,
}: {
	record: MutationRecord;
}): ReportedUsage | null => {
	const { command, result } = record;

	if (command.type === "track" && result.type === "track") {
		if (result.status !== "applied" || !command.usageEvent) return null;
		return {
			orgSlug: command.org.slug,
			eventName: command.usageEvent.name,
			eventId: command.usageEvent.id,
			idempotencyKey: command.usageEvent.idempotencyKey,
			value: command.value,
			properties: trackPropertiesOf({
				command,
				deductions: result.deductions,
			}),
			deductions: result.deductions,
			internalProductId: result.internalProductId,
		};
	}

	if (command.type === "finalize" && result.type === "finalize") {
		if (result.status !== "applied") return null;
		const difference = new Decimal(result.finalValue).minus(result.lockValue);
		if (difference.isZero()) return null;
		return {
			orgSlug: command.org.slug,
			eventName: command.lock.feature_id,
			eventId: null,
			idempotencyKey: null,
			value: difference.toNumber(),
			properties: command.properties ?? command.lock.properties,
			deductions: result.deductions,
			internalProductId: result.internalProductId,
		};
	}

	return null;
};

export const recordToUsageEvent = ({
	position,
	record,
}: StreamRecord): EventInsert | null => {
	const usage = recordToReportedUsage({ record });
	const { command, identity, subject } = record;
	if (!usage || !subject) return null;

	const occurredAt = new Date(command.occurredAt);
	return {
		id: usage.eventId ?? positionToUsageEventId({ position }),
		org_id: identity.orgId,
		org_slug: usage.orgSlug ?? "",
		env: appEnvSchema.parse(identity.env),
		customer_id: identity.customerId,
		internal_customer_id: subject.internalCustomerId,
		entity_id: identity.entityId,
		internal_entity_id: subject.internalEntityId,
		event_name: usage.eventName,
		value: usage.value,
		properties: usage.properties ?? {},
		timestamp: occurredAt,
		created_at: occurredAt.getTime(),
		idempotency_key: usage.idempotencyKey,
		set_usage: false,
		internal_product_id: usage.internalProductId,
		deductions:
			usage.deductions && usage.deductions.length > 0 ? usage.deductions : null,
	};
};
