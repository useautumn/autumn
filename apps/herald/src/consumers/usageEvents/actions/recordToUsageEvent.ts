import type { MutationRecord } from "@autumn/balance-engine";
import { AppEnv, type EventInsert } from "@autumn/shared";
import { Decimal } from "decimal.js";
import { z } from "zod/v4";
import type { StreamRecord } from "../../../stream/types/streamConsumer.js";

const appEnvSchema = z.enum(AppEnv);

/** A record's place in the log, which no replay can change: the same record always makes the same event. */
export const positionToUsageEventId = ({
	position,
}: {
	position: StreamRecord["position"];
}): string => `${position.topic}:${position.partition}:${position.offset}`;

/** What the usage a record reports amounts to: which feature, how much, and under which properties. */
type ReportedUsage = {
	orgSlug: string | undefined;
	eventName: string;
	/** Named by the caller; otherwise the event is named by the record's place in the log. */
	eventId: string | null;
	idempotencyKey: string | null;
	value: number;
	properties: Record<string, unknown> | null;
	deductions: EventInsert["deductions"];
	internalProductId: string | null;
};

/** Null when the record reports no usage: it was refused, records no event, or is a command that moves none. */
const recordToReportedUsage = ({
	record,
}: {
	record: MutationRecord;
}): ReportedUsage | null => {
	const { command, result } = record;

	if (command.type === "track" && result.type === "track") {
		// A track that funds nothing still applies, deducting nothing, and records its event like legacy.
		if (result.status !== "applied" || !command.usageEvent) return null;
		return {
			orgSlug: command.org.slug,
			eventName: command.usageEvent.name,
			eventId: command.usageEvent.id,
			idempotencyKey: command.usageEvent.idempotencyKey,
			value: command.value,
			properties: command.properties,
			deductions: result.deductions,
			internalProductId: result.internalProductId,
		};
	}

	if (command.type === "finalize" && result.type === "finalize") {
		if (result.status !== "applied") return null;
		// The lock already reported what it took; a finalize reports only the difference, and none when there is none.
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

/** The usage event a record stands for, or null when it stands for none or was written before it named its subject. */
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
		// The caller's instant when it gave one, so both columns agree the way the API server writes them.
		timestamp: occurredAt,
		created_at: occurredAt.getTime(),
		idempotency_key: usage.idempotencyKey,
		set_usage: false,
		internal_product_id: usage.internalProductId,
		deductions:
			usage.deductions && usage.deductions.length > 0 ? usage.deductions : null,
	};
};
