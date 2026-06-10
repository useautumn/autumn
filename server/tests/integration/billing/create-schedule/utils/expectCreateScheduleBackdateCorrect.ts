import { expect } from "bun:test";
import {
	type CreateScheduleResponse,
	type CusProductStatus,
	customerProducts,
	ms,
} from "@autumn/shared";
import { expectBackdatedStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectBackdatedStripeSubscriptionCorrect";
import type { initScenario } from "@tests/utils/testInitUtils/initScenario";
import { inArray } from "drizzle-orm";

type Ctx = Awaited<ReturnType<typeof initScenario>>["ctx"];

type ExpectedPhaseProduct = {
	productId: string;
	status: CusProductStatus;
	startsAt: number;
	entityId?: string | null;
};

export const expectCreateScheduleBackdateCorrect = async ({
	ctx,
	response,
	immediate,
	scheduled = [],
	minInvoiceTotal = 2000,
	minInvoiceLineCount,
}: {
	ctx: Ctx;
	response: CreateScheduleResponse;
	immediate: ExpectedPhaseProduct | ExpectedPhaseProduct[];
	scheduled?: ExpectedPhaseProduct[];
	minInvoiceTotal?: number;
	minInvoiceLineCount?: number;
}) => {
	const immediateProducts = Array.isArray(immediate) ? immediate : [immediate];
	const primaryImmediateProduct = immediateProducts[0]!;

	expect(response.status).toBe("created");
	expect(response.invoice?.stripe_id).toBeDefined();
	expect(response.invoice?.total).toBeGreaterThan(minInvoiceTotal / 100);
	expect(response.phases).toHaveLength(1 + scheduled.length);
	expect(response.phases[0]!.starts_at).toBe(primaryImmediateProduct.startsAt);

	for (let i = 0; i < scheduled.length; i++) {
		expect(response.phases[i + 1]!.starts_at).toBe(scheduled[i]!.startsAt);
	}

	const customerProductIds = response.phases.flatMap(
		(phase) => phase.customer_product_ids,
	);
	const rows = await ctx.db
		.select()
		.from(customerProducts)
		.where(inArray(customerProducts.id, customerProductIds));

	const immediateRows = immediateProducts.map((expectedImmediateProduct) => {
		const row = rows.find(
			(row) =>
				row.product_id === expectedImmediateProduct.productId &&
				(expectedImmediateProduct.entityId === undefined ||
					row.entity_id === expectedImmediateProduct.entityId),
		);

		expect(row).toMatchObject({
			status: expectedImmediateProduct.status,
			starts_at: expectedImmediateProduct.startsAt,
		});
		expect(row?.subscription_ids).toHaveLength(1);

		return row!;
	});

	for (const expectedScheduledProduct of scheduled) {
		const scheduledRow = rows.find(
			(row) =>
				row.product_id === expectedScheduledProduct.productId &&
				(expectedScheduledProduct.entityId === undefined ||
					row.entity_id === expectedScheduledProduct.entityId),
		);

		expect(scheduledRow).toMatchObject({
			status: expectedScheduledProduct.status,
		});
		expect(
			Math.abs(
				(scheduledRow?.starts_at ?? 0) - expectedScheduledProduct.startsAt,
			),
		).toBeLessThan(ms.seconds(2));
		expect(scheduledRow?.scheduled_ids ?? []).toHaveLength(1);
	}

	const immediateRow = immediateRows[0]!;
	const stripeSubscriptionId = immediateRow.subscription_ids![0]!;
	for (const row of immediateRows) {
		expect(row.subscription_ids?.[0]).toBe(stripeSubscriptionId);
	}

	const { stripeSchedule } = await expectBackdatedStripeSubscriptionCorrect({
		ctx,
		stripeSubscriptionId,
		startsAt: primaryImmediateProduct.startsAt,
		stripeInvoiceId: response.invoice!.stripe_id,
		minInvoiceTotal,
		minInvoiceLineCount,
		expandSchedule: scheduled.length > 0,
	});

	if (scheduled.length > 0) {
		expect(immediateRow?.scheduled_ids ?? []).toHaveLength(1);
		const autumnScheduleId = immediateRow?.scheduled_ids?.[0];
		expect(autumnScheduleId).toBeDefined();
		expect(stripeSchedule?.id).toBe(autumnScheduleId!);
		expect(stripeSchedule?.phases.length ?? 0).toBeGreaterThan(1);
	}

	return { rows, immediateRow, immediateRows, stripeSchedule };
};
