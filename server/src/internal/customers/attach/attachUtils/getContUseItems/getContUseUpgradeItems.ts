import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { constructPreviewItem } from "@/internal/invoices/previewItemUtils/constructPreviewItem.js";
import { Proration } from "@/internal/invoices/prorationUtils.js";
import { getUsageFromBalance } from "@/internal/products/prices/priceUtils/arrearProratedUtils/getPrevAndNewUsages.js";

import {
	FullEntitlement,
	FullCustomerEntitlement,
	PreviewLineItem,
	Price,
	usageToFeatureName,
} from "@autumn/shared";

import { attachParamsToProduct } from "../convertAttachParams.js";
import { priceToInvoiceItem } from "@/internal/products/prices/priceUtils/priceToInvoiceItem.js";
import { priceToInvoiceAmount } from "@/internal/products/prices/priceUtils/priceToInvoiceAmount.js";
import { Decimal } from "decimal.js";
import { getPrevAndNewPriceForUpgrade } from "@/trigger/arrearProratedUsage/handleProratedUpgrade.js";

export const getContUseUpgradeItems = async ({
	price,
	ent,
	prevCusEnt,
	attachParams,
	curItem,
	curUsage,
	proration,
	logger,
}: {
	price: Price;
	ent: FullEntitlement;
	prevCusEnt: FullCustomerEntitlement;
	attachParams: AttachParams;
	curItem: PreviewLineItem;
	curUsage: number;
	proration?: Proration;
	logger: any;
}) => {
	let prevInvoiceItem = curItem;
	let prevBalance = prevCusEnt.entitlement.allowance! - curUsage;
	let newBalance = ent.allowance! - curUsage;
	let usageDiff = prevBalance - newBalance;

	const product = attachParamsToProduct({ attachParams });
	const feature = prevCusEnt.entitlement.feature;

	let { usage: prevUsage } = getUsageFromBalance({
		ent: prevCusEnt.entitlement,
		price,
		balance: prevBalance,
	});

	let { usage: newUsage } = getUsageFromBalance({
		ent,
		price,
		balance: prevBalance,
	});

	let { usage: totalUsage } = getUsageFromBalance({
		ent,
		price,
		balance: newBalance,
	});

	const newItem = priceToInvoiceItem({
		price,
		ent,
		org: attachParams.org,
		usage: newUsage,
		prodName: product.name,
		proration,
		now: attachParams.now,
	});

	const featureName = usageToFeatureName({
		usage: usageDiff,
		feature,
	});

	const { prevPrice, newPrice } = getPrevAndNewPriceForUpgrade({
		price,
		ent,
		prevBalance,
		newBalance,
		logger,
	});

	const newUsageAmount = new Decimal(newPrice).minus(prevPrice).toNumber();

	const newUsageItem = constructPreviewItem({
		price,
		amount: newUsageAmount,
		description: `${product.name} - ${usageDiff} additional ${featureName}`,
	});

	return {
		oldItem: prevInvoiceItem,
		newItem,
		newUsageItem,
		replaceables: [],
	};
};
