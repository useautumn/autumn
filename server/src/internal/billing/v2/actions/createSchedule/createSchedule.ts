import {
	BillingVersion,
	type CreateScheduleParamsV0,
	type CreateScheduleResponse,
	CusProductStatus,
	customerProducts,
	ms,
	RecaseError,
	schedulePhases,
	schedules,
} from "@autumn/shared";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupAttachProductContext } from "@/internal/billing/v2/actions/attach/setup/setupAttachProductContext";
import { insertNewCusProducts } from "@/internal/billing/v2/execute/executeAutumnActions/insertNewCusProducts";
import { setupFeatureQuantitiesContext } from "@/internal/billing/v2/setup/setupFeatureQuantitiesContext";
import { setupFullCustomerContext } from "@/internal/billing/v2/setup/setupFullCustomerContext";
import { initFullCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProduct";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService";
import { PriceService } from "@/internal/products/prices/PriceService";
import { generateId } from "@/utils/genUtils";

const FIRST_PHASE_TOLERANCE_MS = ms.minutes(1);

/** Sort phases and enforce the minimal schedule invariants. */
const normalizePhases = ({
	currentEpochMs,
	phases,
}: {
	currentEpochMs: number;
	phases: CreateScheduleParamsV0["phases"];
}) => {
	const sortedPhases = [...phases].sort((a, b) => a.starts_at - b.starts_at);
	const [firstPhase] = sortedPhases;

	for (let i = 1; i < sortedPhases.length; i++) {
		const previousPhase = sortedPhases[i - 1];
		const currentPhase = sortedPhases[i];

		if (
			previousPhase &&
			currentPhase &&
			previousPhase.starts_at >= currentPhase.starts_at
		) {
			throw new RecaseError({
				message: "Phase starts_at values must be strictly increasing",
				statusCode: 400,
			});
		}
	}

	if (
		firstPhase &&
		(firstPhase.starts_at < currentEpochMs - FIRST_PHASE_TOLERANCE_MS ||
			firstPhase.starts_at > currentEpochMs + FIRST_PHASE_TOLERANCE_MS)
	) {
		throw new RecaseError({
			message: "The first phase must start immediately",
			statusCode: 400,
		});
	}

	return sortedPhases;
};

/** Remove the existing schedule for the same customer and entity scope. */
const deleteExistingSchedules = async ({
	ctx,
	internalCustomerId,
	internalEntityId,
}: {
	ctx: AutumnContext;
	internalCustomerId: string;
	internalEntityId?: string;
}) => {
	const existingSchedules = await ctx.db
		.select({ id: schedules.id })
		.from(schedules)
		.where(
			and(
				eq(schedules.internal_customer_id, internalCustomerId),
				internalEntityId
					? eq(schedules.internal_entity_id, internalEntityId)
					: isNull(schedules.internal_entity_id),
			),
		);

	if (existingSchedules.length === 0) return;

	const scheduleIds = existingSchedules.map((schedule) => schedule.id);
	const existingPhases = await ctx.db
		.select({ customer_product_ids: schedulePhases.customer_product_ids })
		.from(schedulePhases)
		.where(inArray(schedulePhases.schedule_id, scheduleIds));

	const existingCustomerProductIds = existingPhases.flatMap(
		(phase) => phase.customer_product_ids,
	);

	if (existingCustomerProductIds.length > 0) {
		await ctx.db
			.delete(customerProducts)
			.where(
				and(
					inArray(customerProducts.id, existingCustomerProductIds),
					eq(customerProducts.status, CusProductStatus.Scheduled),
				),
			);
	}

	await ctx.db.delete(schedules).where(inArray(schedules.id, scheduleIds));
};

/** Build scheduled customer products for each requested phase. */
const materializePhaseProducts = async ({
	ctx,
	currentEpochMs,
	params,
}: {
	ctx: AutumnContext;
	currentEpochMs: number;
	params: CreateScheduleParamsV0;
}) => {
	const fullCustomer = await setupFullCustomerContext({
		ctx,
		params,
	});
	const normalizedPhases = normalizePhases({
		currentEpochMs,
		phases: params.phases,
	});

	const phaseProducts = await Promise.all(
		normalizedPhases.map(async (phase) => {
			const materializedProducts = await Promise.all(
				phase.plans.map(async (plan) => {
					const {
						fullProduct,
						customPrices = [],
						customEnts: customEntitlements = [],
					} = await setupAttachProductContext({
						ctx,
						params: plan,
					});
					const featureQuantities = setupFeatureQuantitiesContext({
						ctx,
						featureQuantitiesParams: {
							feature_quantities: plan.feature_quantities,
						},
						fullProduct,
						initializeUndefinedQuantities: true,
					});

					const customerProduct = initFullCustomerProduct({
						ctx,
						initContext: {
							fullCustomer,
							fullProduct,
							featureQuantities,
							resetCycleAnchor: phase.starts_at,
							freeTrial: null,
							now: currentEpochMs,
							billingVersion: BillingVersion.V2,
						},
						initOptions: {
							startsAt: phase.starts_at,
							status: CusProductStatus.Scheduled,
						},
					});

					return {
						customerProduct,
						customPrices,
						customEntitlements,
					};
				}),
			);

			return {
				starts_at: phase.starts_at,
				customerProducts: materializedProducts.map(
					({ customerProduct }) => customerProduct,
				),
				customPrices: materializedProducts.flatMap(
					({ customPrices }) => customPrices,
				),
				customEntitlements: materializedProducts.flatMap(
					({ customEntitlements }) => customEntitlements,
				),
			};
		}),
	);

	return {
		fullCustomer,
		phaseProducts,
	};
};

/** Create a minimal Autumn-managed billing schedule without Stripe sync. */
export const createSchedule = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CreateScheduleParamsV0;
}): Promise<CreateScheduleResponse> => {
	const customerId = params.customer_id;
	const currentEpochMs = Date.now();
	const { fullCustomer, phaseProducts } = await materializePhaseProducts({
		ctx,
		currentEpochMs,
		params,
	});

	await deleteExistingSchedules({
		ctx,
		internalCustomerId: fullCustomer.internal_id,
		internalEntityId: fullCustomer.entity?.internal_id ?? undefined,
	});

	const scheduleId = generateId("sched");
	await ctx.db.insert(schedules).values({
		id: scheduleId,
		org_id: ctx.org.id,
		env: ctx.env,
		internal_customer_id: fullCustomer.internal_id,
		customer_id: customerId,
		internal_entity_id: fullCustomer.entity?.internal_id ?? null,
		entity_id: fullCustomer.entity?.id ?? null,
		created_at: currentEpochMs,
	});

	const newCustomerProducts = phaseProducts.flatMap(
		(phase) => phase.customerProducts,
	);
	const customEntitlements = phaseProducts.flatMap(
		(phase) => phase.customEntitlements,
	);
	if (customEntitlements.length > 0) {
		await EntitlementService.insert({
			db: ctx.db,
			data: customEntitlements,
		});
	}

	const customPrices = phaseProducts.flatMap((phase) => phase.customPrices);
	if (customPrices.length > 0) {
		await PriceService.insert({
			db: ctx.db,
			data: customPrices,
		});
	}

	await insertNewCusProducts({
		ctx,
		newCusProducts: newCustomerProducts,
	});

	const insertedPhases = phaseProducts.map((phase) => ({
		phase_id: generateId("phase"),
		starts_at: phase.starts_at,
		customer_product_ids: phase.customerProducts.map(
			(customerProduct) => customerProduct.id,
		),
	}));
	await ctx.db.insert(schedulePhases).values(
		insertedPhases.map((phase) => ({
			id: phase.phase_id,
			schedule_id: scheduleId,
			starts_at: phase.starts_at,
			customer_product_ids: phase.customer_product_ids,
			created_at: currentEpochMs,
		})),
	);

	return {
		customer_id: customerId,
		entity_id: fullCustomer.entity?.id ?? null,
		schedule_id: scheduleId,
		phases: insertedPhases,
		payment_url: null,
	};
};
