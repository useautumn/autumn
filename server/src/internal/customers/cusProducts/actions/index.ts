import { activateScheduledCustomerProduct } from "./activateScheduled";
import { deleteScheduledCustomerProduct } from "./deleteScheduledCustomerProduct";
import { expireCustomerProductAndActivateDefault } from "./expireAndActivateDefault";

export const customerProductActions = {
	/** Expires a customer product and activates default if no other active in group */
	expireAndActivateDefault: expireCustomerProductAndActivateDefault,

	/** Activates a scheduled customer product with new subscription/schedule IDs */
	activateScheduled: activateScheduledCustomerProduct,

	/** Deletes any scheduled main customer product in the same group */
	deleteScheduled: deleteScheduledCustomerProduct,
};

export {
	expireCustomerProductAndActivateDefault,
	activateScheduledCustomerProduct,
	deleteScheduledCustomerProduct,
};
