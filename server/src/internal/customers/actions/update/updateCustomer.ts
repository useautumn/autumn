import {
	type Customer,
	CustomerAlreadyExistsError,
	CustomerNotFoundError,
	notNullish,
	ProcessorType,
	RecaseError,
	shouldForwardCustomerMetadata,
	type UpdateCustomerParamsV1,
} from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import {
	autumnToStripeCustomerMetadata,
	STRIPE_MAX_KEY_LENGTH,
} from "@/external/stripe/customers/utils/autumnToStripeMetadata";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { triggerAutoTopUpsOnEnabled } from "@/internal/balances/autoTopUp/triggerAutoTopUpsOnEnabled";
import { CusService } from "@/internal/customers/CusService";
import { invalidateCachedFullSubject } from "../../cache/fullSubject/actions/invalidate/invalidateFullSubject";
import { updateCachedCustomerData } from "../../cusUtils/fullCustomerCacheUtils/updateCachedCustomerData";
import { getApiCustomerByRollout } from "../getApiCustomerByRollout";

export const updateCustomer = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: UpdateCustomerParamsV1;
}): Promise<{
	oldCustomer: Customer;
	apiCustomer: Record<string, unknown>;
}> => {
	const { db, org, env, logger } = ctx;
	const {
		customer_id: customerId,
		new_customer_id: newCustomerId,
		billing_controls,
		...newCusData
	} = params;

	const originalCustomer = await CusService.get({
		db,
		idOrInternalId: customerId,
		orgId: org.id,
		env,
	});

	if (!originalCustomer) {
		throw new CustomerNotFoundError({ customerId });
	}

	if (newCustomerId === null) {
		throw new RecaseError({
			message: `Not allowed to update a customer's ID to null`,
		});
	}

	if (notNullish(newCustomerId) && originalCustomer.id !== newCustomerId) {
		// Fetch for existing customer
		const existingCustomer = await CusService.get({
			db,
			idOrInternalId: newCustomerId,
			orgId: org.id,
			env,
		});

		if (existingCustomer) {
			throw new CustomerAlreadyExistsError({
				message: `Customer with ID ${newCustomerId} already exists, can't change to this ID`,
				customerId: newCustomerId,
			});
		}
	}

	// Try to update stripe ID
	let stripeId = originalCustomer.processor?.id;
	const newStripeId = newCusData.stripe_id;

	if (notNullish(newStripeId) && stripeId !== newStripeId) {
		const stripeCli = createStripeCli({ org, env });
		await stripeCli.customers.retrieve(newStripeId);

		stripeId = newCusData.stripe_id;
		logger.info(
			`Updating customer's Stripe ID from ${originalCustomer.processor?.id} to ${stripeId}`,
		);
	}

	const oldMetadata = originalCustomer.metadata || {};
	const newMetadata = newCusData.metadata || {};
	const deletedMetadataKeys: string[] = [];
	for (const key in newMetadata) {
		if (newMetadata[key] === null) {
			deletedMetadataKeys.push(key);
			delete newMetadata[key];
			delete oldMetadata[key];
		}
	}
	const mergedMetadata = { ...oldMetadata, ...newMetadata };

	const hasMetadataChanges =
		Object.keys(newMetadata).length > 0 || deletedMetadataKeys.length > 0;
	const forwardMetadata =
		shouldForwardCustomerMetadata({ org }) && hasMetadataChanges;

	const stripeMetadataDeletions: Record<string, ""> = {};
	for (const key of deletedMetadataKeys) {
		if (!key.startsWith("autumn_"))
			stripeMetadataDeletions[key.slice(0, STRIPE_MAX_KEY_LENGTH)] = "";
	}

	const stripeUpdate: Stripe.CustomerUpdateParams = {
		email:
			originalCustomer.email !== newCusData.email &&
			notNullish(newCusData.email)
				? newCusData.email
				: undefined,
		name:
			originalCustomer.name !== newCusData.name && notNullish(newCusData.name)
				? newCusData.name
				: undefined,
		...(forwardMetadata && {
			metadata: {
				...autumnToStripeCustomerMetadata({ metadata: mergedMetadata }),
				...stripeMetadataDeletions,
			},
		}),
	};

	if (Object.keys(stripeUpdate).length > 0 && stripeId) {
		const stripeCli = createStripeCli({ org, env });
		await stripeCli.customers.update(stripeId, stripeUpdate);
	}

	// Prepare update data — only include defined billing control fields
	const billingControlUpdates: Partial<Customer> = {};
	if (billing_controls) {
		if (billing_controls.auto_topups !== undefined)
			billingControlUpdates.auto_topups = billing_controls.auto_topups;
		if (billing_controls.spend_limits !== undefined)
			billingControlUpdates.spend_limits = billing_controls.spend_limits;
		if (billing_controls.usage_alerts !== undefined)
			billingControlUpdates.usage_alerts = billing_controls.usage_alerts;
		if (billing_controls.overage_allowed !== undefined)
			billingControlUpdates.overage_allowed = billing_controls.overage_allowed;
	}

	const updateData: Partial<Customer> = {
		...newCusData,
		id: newCustomerId,
		metadata: mergedMetadata,
		...billingControlUpdates,
	};

	if (newStripeId) {
		// Only set processor if newStripeId is provided
		updateData.processor = { id: newStripeId, type: ProcessorType.Stripe };
	}

	if (!notNullish(newCustomerId) || originalCustomer.id === newCustomerId) {
		// Remove id from update if not changing
		delete updateData.id;
	}

	await CusService.update({
		ctx,
		idOrInternalId: originalCustomer.id || originalCustomer.internal_id,
		update: updateData,
	});

	const originalCustomerId =
		originalCustomer.id || originalCustomer.internal_id;
	const updatedCustomerId = newCustomerId ?? customerId;

	if (updatedCustomerId !== originalCustomerId) {
		await invalidateCachedFullSubject({
			ctx,
			customerId: originalCustomerId,
			source: "updateCustomer:id_changed",
		});
	}

	await updateCachedCustomerData({
		ctx,
		customerId: originalCustomerId,
		updates: updateData,
	});

	ctx.skipCache = true;
	const resolvedCustomerId = newCustomerId ?? customerId;

	const apiCustomer = await getApiCustomerByRollout({
		ctx,
		customerId: resolvedCustomerId,
		source: "updateCustomer",
	});

	if (billing_controls?.auto_topups) {
		triggerAutoTopUpsOnEnabled({
			ctx,
			oldCustomer: originalCustomer,
			newAutoTopups: billing_controls.auto_topups,
			customerId: resolvedCustomerId,
		}).catch((err) =>
			ctx.logger.error("triggerAutoTopUpsOnEnabled failed: ", { error: err }),
		);
	}

	return {
		oldCustomer: originalCustomer,
		apiCustomer,
	};
};
