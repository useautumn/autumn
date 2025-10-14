import {
	type AttachBody,
	AttachBranch,
	type AttachConfig,
	AttachFunction,
	CusProductStatus,
} from "@autumn/shared";
import chalk from "chalk";
import { handleCreateCheckout } from "../../add-product/handleCreateCheckout.js";
import { handleCreateInvoiceCheckout } from "../../add-product/handleCreateInvoiceCheckout.js";
import type { AttachParams } from "../../cusProducts/AttachParams.js";
import { CusProductService } from "../../cusProducts/CusProductService.js";
import { handleAddProduct } from "../attachFunctions/addProductFlow/handleAddProduct.js";
import { handleOneOffFunction } from "../attachFunctions/addProductFlow/handleOneOffFunction.js";
import { handleRenewProduct } from "../attachFunctions/handleRenewProduct.js";
import { handleMultiAttachFlow } from "../attachFunctions/multiAttach/handleMultiAttachFlow.js";
import { handleScheduleFunction2 } from "../attachFunctions/scheduleFlow/handleScheduleFlow2.js";
import { handleUpdateQuantityFunction } from "../attachFunctions/updateQuantityFlow/updateQuantityFlow.js";
import { handleUpgradeFlow } from "../attachFunctions/upgradeFlow/handleUpgradeFlow.js";
import {
	attachParamsToCurCusProduct,
	attachParamToCusProducts,
} from "./convertAttachParams.js";

/* 
1. If from new version, free trial should just carry over
2. If from new version, can't update with trial...
3. In migrateCustomer flow, if to free product, upgrade product still called... should be changed to add product...
5. Migrate customer uses proration behaviour none
*/

export const getAttachFunction = async ({
	branch,
	attachParams,
	attachBody,
	config,
}: {
	branch: AttachBranch;
	attachParams: AttachParams;
	attachBody: AttachBody;
	config: AttachConfig;
}) => {
	const { onlyCheckout } = config;

	// 1. Checkout function
	const newScenario = [
		AttachBranch.MultiAttach,
		AttachBranch.MultiProduct,
		AttachBranch.OneOff,
		AttachBranch.New,
		AttachBranch.AddOn,
		AttachBranch.MainIsFree,
		AttachBranch.MainIsTrial,
	].includes(branch);

	// Check for upgrade/downgrade from default trial (should also use checkout)
	

	if (newScenario && onlyCheckout) {
		return AttachFunction.CreateCheckout;
	} else if (branch === AttachBranch.OneOff) {
		return AttachFunction.OneOff;
	} else if (
		branch === AttachBranch.MultiAttach ||
		branch === AttachBranch.MultiAttachUpdate
	) {
		return AttachFunction.MultiAttach;
	} else if (newScenario) {
		return AttachFunction.AddProduct;
	}

	// 2. Upgrade scenarios
	const updateScenarios = [
		AttachBranch.NewVersion,
		AttachBranch.SameCustom,
		AttachBranch.SameCustomEnts,
		AttachBranch.Upgrade,
	];

	if (updateScenarios.includes(branch)) {
		if (config.sameIntervals) {
			return AttachFunction.UpgradeSameInterval;
		} else {
			return AttachFunction.UpgradeDiffInterval;
		}
	}

	// 3. Downgrade scenarios
	if (branch === AttachBranch.Downgrade) {
		return AttachFunction.ScheduleProduct;
	}

	// 4. Prepaid scenarios
	if (branch === AttachBranch.UpdatePrepaidQuantity) {
		const curSameProduct = attachParamsToCurCusProduct({ attachParams });
		if (curSameProduct?.free_trial) {
			attachParams.freeTrial = curSameProduct.free_trial;
		}
		return AttachFunction.UpdatePrepaidQuantity;
	}

	if (branch === AttachBranch.Renew) {
		return AttachFunction.Renew;
	}

	return AttachFunction.AddProduct;
};

export const runAttachFunction = async ({
	req,
	res,
	branch,
	attachParams,
	attachBody,
	config,
}: {
	req: any;
	res: any;
	branch: AttachBranch;
	attachParams: AttachParams;
	attachBody: AttachBody;
	config: AttachConfig;
}) => {
	const { logger, db } = req;
	const { stripeCli } = attachParams;

	const attachFunction = await getAttachFunction({
		branch,
		attachParams,
		attachBody,
		config,
	});

	// console.log("Attach Function:", attachFunction);
	// throw new Error("Attach Function:");

	const customer = attachParams.customer;
	const org = attachParams.org;

	const productIdsStr = attachParams.products.map((p) => p.id).join(", ");
	const { curMainProduct, curSameProduct, curScheduledProduct } =
		attachParamToCusProducts({
			attachParams,
		});

	const curCusProduct = attachParamsToCurCusProduct({ attachParams });

	logger.info(`--------------------------------`);
	logger.info(
		`ATTACHING ${productIdsStr} to ${customer.name} (${customer.id || customer.email}), org: ${org.slug}\n`,
	);
	if (customer.entity) {
		logger.info(`Entity: ${customer.entity.name} (${customer.entity.id})`);
	}
	logger.info(
		`Branch: ${chalk.yellow(branch)}, Function: ${chalk.yellow(attachFunction)}`,
	);

	if (curMainProduct) {
		logger.info(`→ Current Main Product: ${curMainProduct.product.id}`);
	}
	if (curSameProduct) {
		logger.info(`→ Current Same Product: ${curSameProduct.product.id}`);
	}
	if (curScheduledProduct) {
		logger.info(
			`→ Current Scheduled Product: ${curScheduledProduct.product.id}`,
		);
	}

	if (attachFunction === AttachFunction.OneOff) {
		return await handleOneOffFunction({
			req,
			res,
			attachParams,
			config,
		});
	}

	if (attachFunction === AttachFunction.Renew) {
		return await handleRenewProduct({
			req,
			res,
			attachParams,
			config,
		});
	}

	// 2. If main is trial, cancel it...
	if (branch === AttachBranch.MainIsTrial) {
		await CusProductService.update({
			db,
			cusProductId: curMainProduct!.id,
			updates: {
				ended_at: attachParams.now,
				canceled: true,
				status: CusProductStatus.Expired,
			},
		});

		const subId = curMainProduct?.subscription_ids?.[0];
		if (subId) {
			await stripeCli.subscriptions.cancel(subId, {
				cancellation_details: {
					comment: "autumn_downgrade,trial_canceled",
				},
			});
		}
	}

	if (attachFunction === AttachFunction.MultiAttach) {
		return await handleMultiAttachFlow({
			req,
			res,
			attachParams,
			attachBody,
			branch,
			config,
		});
	}

	if (attachFunction === AttachFunction.CreateCheckout) {
		if (config.invoiceCheckout) {
			return await handleCreateInvoiceCheckout({
				req,
				res,
				attachParams,
				attachBody,
				config,
				branch,
			});
		}
		return await handleCreateCheckout({
			req,
			res,
			attachParams,
			config,
		});
	}

	if (attachFunction === AttachFunction.AddProduct) {
		return await handleAddProduct({
			req,
			res,
			attachParams,
			config,
			branch,
		});
	}

	if (attachFunction === AttachFunction.ScheduleProduct) {
		return await handleScheduleFunction2({
			req,
			res,
			attachParams,
			config,
		});
	}

	if (
		attachFunction === AttachFunction.UpgradeDiffInterval ||
		attachFunction === AttachFunction.UpgradeSameInterval
	) {
		return await handleUpgradeFlow({
			req,
			res,
			attachParams,
			config,
			branch,
		});
	}

	if (attachFunction === AttachFunction.UpdatePrepaidQuantity) {
		return await handleUpdateQuantityFunction({
			req,
			res,
			attachParams,
			config,
		});
	}
};
