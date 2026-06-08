import type { BaseApiCustomerV5 } from "@api/customers/apiCustomerV5.js";
import type { ApiCustomerSchedule } from "@api/customers/components/apiCustomerSchedule";

const defaultCreatedAt = new Date("2026-01-01T00:00:00.000Z");

export const baseSchedule = ({
	createdAt = defaultCreatedAt,
	customer,
	customerId = customer?.id ?? "customer",
	entityId = null,
	id = `sched_${customerId}`,
	phases,
}: {
	createdAt?: Date;
	customer?: BaseApiCustomerV5;
	customerId?: string;
	entityId?: string | null;
	id?: string;
	phases: Array<{
		customerProductIds?: string[];
		id?: string;
		startsAt: Date;
	}>;
}): ApiCustomerSchedule => ({
	id,
	customer_id: customerId,
	entity_id: entityId,
	created_at: createdAt.getTime(),
	phases: phases.map((phase, index) => ({
		id: phase.id ?? `${id}_phase_${index + 1}`,
		created_at: createdAt.getTime(),
		customer_product_ids: phase.customerProductIds ?? [],
		starts_at: phase.startsAt.getTime(),
	})),
});
