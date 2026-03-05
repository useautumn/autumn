import { getExpiredCustomerProductsCacheAndMerge } from "@/internal/customers/cusProducts/actions/expiredCache/getExpiredCustomerProductsCache";
import { activateFreeSuccessorProduct } from "./activateFreeSuccessorProduct";
import { activateScheduledCustomerProduct } from "./activateScheduled";
import { deleteScheduledCustomerProduct } from "./deleteScheduledCustomerProduct";
import { expireCustomerProductAndActivateDefault } from "./expireAndActivateDefault";
import {
	getExpiredCustomerProductsCache,
	setExpiredCustomerProductsCache,
} from "./expiredCache";
import { updateCustomerProductDbAndCache } from "./updateDbAndCache";

export const customerProductActions = {
	/** Expires a customer product and activates default if no other active in group */
	expireAndActivateDefault: expireCustomerProductAndActivateDefault,

	/** Activates a free successor product (scheduled or default) after expiry */
	activateFreeSuccessor: activateFreeSuccessorProduct,

	/** Activates a scheduled customer product with new subscription/schedule IDs */
	activateScheduled: activateScheduledCustomerProduct,

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
