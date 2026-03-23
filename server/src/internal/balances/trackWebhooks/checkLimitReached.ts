import {
	type ApiCustomerV5,
	type ApiEntityV2,
	apiBalanceToAllowed,
	type Feature,
	type FullCustomer,
	WebhookEventType,
} from "@autumn/shared";
import { sendSvixEvent } from "@/external/svix/svixHelpers.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getApiCustomerBase } from "@/internal/customers/cusUtils/apiCusUtils/getApiCustomerBase.js";
import { getApiEntityBase } from "@/internal/entities/entityUtils/apiEntityUtils/getApiEntityBase.js";

const checkLimitForSubject = async ({
	ctx,
	oldFullCus,
	newFullCus,
	feature,
	entityId,
}: {
	ctx: AutumnContext;
	oldFullCus: FullCustomer;
	newFullCus: FullCustomer;
	feature: Feature;
	entityId?: string;
}) => {
	const entity = entityId
		? newFullCus.entities?.find((e) => e.id === entityId)
		: undefined;

	let oldSubject: ApiCustomerV5 | ApiEntityV2 | undefined;
	let newSubject: ApiCustomerV5 | ApiEntityV2 | undefined;

	if (entity) {
		const { apiEntity: oldApiEntity } = await getApiEntityBase({
			ctx,
			entity,
			fullCus: oldFullCus,
		});
		const { apiEntity: newApiEntity } = await getApiEntityBase({
			ctx,
			entity,
			fullCus: newFullCus,
		});
		oldSubject = oldApiEntity;
		newSubject = newApiEntity;
	} else {
		const { apiCustomer: oldApiCustomer } = await getApiCustomerBase({
			ctx,
			fullCus: oldFullCus,
		});
		const { apiCustomer: newApiCustomer } = await getApiCustomerBase({
			ctx,
			fullCus: newFullCus,
		});
		oldSubject = oldApiCustomer;
		newSubject = newApiCustomer;
	}

	const oldBalance = oldSubject.balances?.[feature.id];
	const newBalance = newSubject.balances?.[feature.id];

	if (!oldBalance || !newBalance) return;

	const oldResult = apiBalanceToAllowed({
		apiBalance: oldBalance,
		apiSubject: oldSubject,
		feature,
		requiredBalance: 0.0000001,
	});

	const newResult = apiBalanceToAllowed({
		apiBalance: newBalance,
		apiSubject: newSubject,
		feature,
		requiredBalance: 0.0000001,
	});

	if (!oldResult.allowed || newResult.allowed) return;

	const customerId = newFullCus.id || newFullCus.internal_id;

	await sendSvixEvent({
		ctx,
		eventType: WebhookEventType.BalancesLimitReached,
		data: {
			customer_id: customerId,
			feature_id: feature.id,
			limit_type: newResult.limitType ?? "included",
			...(entityId && { entity_id: entityId }),
		},
	});

	ctx.logger.info(
		`Limit reached for customer ${customerId}, feature ${feature.id}, type ${newResult.limitType ?? "included"}${entityId ? `, entity ${entityId}` : ""}`,
	);
};

export const checkLimitReached = async ({
	ctx,
	oldFullCus,
	newFullCus,
	feature,
	entityId,
}: {
	ctx: AutumnContext;
	oldFullCus: FullCustomer;
	newFullCus: FullCustomer;
	feature: Feature;
	entityId?: string;
}) => {
	try {
		await checkLimitForSubject({
			ctx,
			oldFullCus,
			newFullCus,
			feature,
			entityId,
		});
	} catch (error) {
		ctx.logger.error(`[checkLimitReached] error: ${error}`, { error });
	}
};
