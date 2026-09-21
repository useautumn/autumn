import type { MutationRecord } from "@autumn/balance-engine";
import type { MeteringRecordApplication } from "@autumn/kafka";
import { AppEnv, type EventInsert } from "@autumn/shared";
import { z } from "zod/v4";

const appEnvSchema = z.enum(AppEnv);

/** A record's place in the log, which no replay can change: the same record always makes the same event. */
export const positionToUsageEventId = ({
	position,
}: {
	position: MeteringRecordApplication["position"];
}): string => `${position.topic}:${position.partition}:${position.offset}`;

/**
 * The usage event a record stands for, or null when it stands for none: a track that was refused,
 * a command that moves no usage, or a record written before it named its subject.
 */
export const recordToUsageEvent = ({
	position,
	record,
}: {
	position: MeteringRecordApplication["position"];
	record: MutationRecord;
}): EventInsert | null => {
	const { command, result, identity, subject } = record;
	if (command.type !== "track" || result.type !== "track") return null;
	if (result.status !== "applied" || !subject) return null;

	const occurredAt = new Date(command.occurredAt);
	return {
		id: positionToUsageEventId({ position }),
		org_id: identity.orgId,
		org_slug: command.org.slug ?? "",
		env: appEnvSchema.parse(identity.env),
		customer_id: identity.customerId,
		internal_customer_id: subject.internalCustomerId,
		entity_id: identity.entityId,
		internal_entity_id: subject.internalEntityId,
		event_name: command.featureId,
		value: command.value,
		properties: command.properties ?? {},
		// The caller's instant when it gave one, so both columns agree the way the API server writes them.
		timestamp: occurredAt,
		created_at: occurredAt.getTime(),
		idempotency_key: null,
		set_usage: false,
		internal_product_id: result.internalProductId,
		deductions: result.deductions.length > 0 ? result.deductions : null,
	};
};
