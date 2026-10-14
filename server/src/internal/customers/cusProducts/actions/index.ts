import { getExpiredCustomerProductsCacheAndMerge } from "@/internal/customers/cusProducts/actions/expiredCache/getExpiredCustomerProductsCache";
import { activateFreeSuccessorProduct } from "./activateFreeSuccessorProduct";
import { activateScheduledCustomerProduct } from "./activateScheduled";
import { cancelCustomerProduct } from "./cancelCustomerProduct";
import { deleteScheduledCustomerProduct } from "./deleteScheduledCustomerProduct";
import { detachSchedulePhases } from "./detachSchedulePhases/detachSchedulePhases";
import { expireCustomerProductAndActivateDefault } from "./expireAndActivateDefault";
import {
	getExpiredCustomerProductsCache,
	setExpiredCustomerProductsCache,
} from "./expiredCache";
import { markCustomerProductActive } from "./markCustomerProductActive";
import { markCustomerProductPastDue } from "./markCustomerProductPastDue";
import { preserveOneOffPrepaidCarryOvers } from "./preserveOneOffPrepaidCarryOvers";
import { renewCustomerProduct } from "./renewCustomerProduct";
import { uncancelCustomerProduct } from "./uncancelCustomerProduct";
import { updateCustomerProductDbAndCache } from "./updateDbAndCache";

export const customerProductActions = {
	expireAndActivateDefault: expireCustomerProductAndActivateDefault,

	activateFreeSuccessor: activateFreeSuccessorProduct,

	activateScheduled: activateScheduledCustomerProduct,

	cancel: cancelCustomerProduct,

	uncancel: uncancelCustomerProduct,

	renew: renewCustomerProduct,

	markPastDue: markCustomerProductPastDue,

	markActive: markCustomerProductActive,

	preserveOneOffPrepaid: preserveOneOffPrepaidCarryOvers,

	deleteScheduled: deleteScheduledCustomerProduct,
	detachSchedulePhases,

	updateDbAndCache: updateCustomerProductDbAndCache,

	expiredCache: {
		set: setExpiredCustomerProductsCache,
		get: getExpiredCustomerProductsCache,
		getAndMerge: getExpiredCustomerProductsCacheAndMerge,
	},
};
