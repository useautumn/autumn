import {
	type FullCustomerEntitlement,
	type FullEntitlement,
	type PreviewLineItem,
	type Price,
	usageToFeatureName,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { constructPreviewItem } from "@/internal/invoices/previewItemUtils/constructPreviewItem.js";
import type { Proration } from "@/internal/invoices/prorationUtils.js";
import { getUsageFromBalance } from "@/internal/products/prices/priceUtils/arrearProratedUtils/getPrevAndNewUsages.js";
import { priceToInvoiceItem } from "@/internal/products/prices/priceUtils/priceToInvoiceItem.js";
import { getPrevAndNewPriceForUpgrade } from "@/trigger/arrearProratedUsage/handleProratedUpgrade.js";
import { attachParamsToProduct } from "../convertAttachParams.js";

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
	const prevInvoiceItem = curItem;
	const prevBalance = prevCusEnt.entitlement.allowance! - curUsage;
	const newBalance = ent.allowance! - curUsage;
	const usageDiff = prevBalance - newBalance;

	const product = attachParamsToProduct({ attachParams });
	const feature = prevCusEnt.entitlement.feature;

	const { usage: prevUsage } = getUsageFromBalance({
		ent: prevCusEnt.entitlement,
		price,
		balance: prevBalance,
	});

	const { usage: newUsage } = getUsageFromBalance({
		ent,
		price,
		balance: prevBalance,
	});

	const { usage: totalUsage } = getUsageFromBalance({
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
