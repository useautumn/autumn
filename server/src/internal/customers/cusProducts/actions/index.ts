import { getExpiredCustomerProductsCacheAndMerge } from "@/internal/customers/cusProducts/actions/expiredCache/getExpiredCustomerProductsCache";
import { activateFreeSuccessorProduct } from "./activateFreeSuccessorProduct";
import { activateScheduledCustomerProduct } from "./activateScheduled";
import { cancelCustomerProduct } from "./cancelCustomerProduct";
import { deleteScheduledCustomerProduct } from "./deleteScheduledCustomerProduct";
import { expireCustomerProductAndActivateDefault } from "./expireAndActivateDefault";
import {
	getExpiredCustomerProductsCache,
	setExpiredCustomerProductsCache,
} from "./expiredCache";
import { markCustomerProductActive } from "./markCustomerProductActive";
import { markCustomerProductPastDue } from "./markCustomerProductPastDue";
import { preserveOneOffPrepaidCarryOvers } from "./preserveOneOffPrepaidCarryOvers";
import { uncancelCustomerProduct } from "./uncancelCustomerProduct";
import { updateCustomerProductDbAndCache } from "./updateDbAndCache";

export const customerProductActions = {
	/** Expires a customer product and activates default if no other active in group */
	expireAndActivateDefault: expireCustomerProductAndActivateDefault,

	/** Activates a free successor product (scheduled or default) after expiry */
	activateFreeSuccessor: activateFreeSuccessorProduct,

	/** Activates a scheduled customer product with new subscription/schedule IDs */
	activateScheduled: activateScheduledCustomerProduct,

	/** Cancels a customer product and sends a Cancel webhook */
	cancel: cancelCustomerProduct,

	/** Uncancels a customer product and sends a Renew webhook */
	uncancel: uncancelCustomerProduct,

	/** Marks a customer product as past due and sends a PastDue webhook */
	markPastDue: markCustomerProductPastDue,

	/** Marks a customer product as active (e.g. recovery from past-due); webhook gated by sendWebhook flag */
	markActive: markCustomerProductActive,

	/**
	 * Persists remaining one-off prepaid balances as lifetime cusEnts before
	 * the customer product is expired (webhook-driven flows).
	 */
	preserveOneOffPrepaid: preserveOneOffPrepaidCarryOvers,

	/** Deletes any scheduled main customer product in the same group */
	deleteScheduled: deleteScheduledCustomerProduct,

	/** Updates a customer product in both Postgres and the Redis FullCustomer cache */
	updateDbAndCache: updateCustomerProductDbAndCache,

	/** Cache operations for expired customer products (used by subscription.deleted → invoice.created) */
	expiredCache: {
		set: setExpiredCustomerProductsCache,
		get: getExpiredCustomerProductsCache,
		getAndMerge: getExpiredCustomerProductsCacheAndMerge,
	},
};
