import {
	AttachReplaceableSchema,
	type FullCustomerEntitlement,
	type FullEntitlement,
	type PreviewLineItem,
	type Price,
	usageToFeatureName,
} from "@autumn/shared";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { constructPreviewItem } from "@/internal/invoices/previewItemUtils/constructPreviewItem.js";
import type { Proration } from "@/internal/invoices/prorationUtils.js";
import { getUsageFromBalance } from "@/internal/products/prices/priceUtils/arrearProratedUtils/getPrevAndNewUsages.js";
import { priceToInvoiceItem } from "@/internal/products/prices/priceUtils/priceToInvoiceItem.js";
import { generateId } from "@/utils/genUtils.js";
import { attachParamsToProduct } from "../convertAttachParams.js";

export const getContUseDowngradeItems = async ({
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
	const product = attachParamsToProduct({ attachParams });
	const feature = prevCusEnt.entitlement.feature;

	const { usage: prevUsage, overage: prevOverage } = getUsageFromBalance({
		ent: prevCusEnt.entitlement,
		price,
		balance: prevBalance,
	});

	const { usage: newUsage, overage: newOverage } = getUsageFromBalance({
		ent,
		price,
		balance: prevBalance,
	});

	if (prevOverage === 0) {
		const { usage: newUsage } = getUsageFromBalance({
			ent,
			price,
			balance: ent.allowance! - curUsage,
		});

		const newItem = priceToInvoiceItem({
			price,
			ent,
			org: attachParams.org,
			usage: newUsage,
			prodName: product.name,
			proration,
			now: attachParams.now,
			allowNegative: false,
		});

		return {
			oldItem: prevInvoiceItem,
			newItem,
			newUsageItem: null,
			replaceables: [],
		};
	}

	const newItem = priceToInvoiceItem({
		price,
		ent,
		org: attachParams.org,
		usage: newUsage,
		prodName: product.name,
		proration,
		now: attachParams.now,
	});

	const numReplaceables = newUsage - prevUsage;

	const replaceables = Array.from({ length: numReplaceables }, (_, _i) =>
		AttachReplaceableSchema.parse({
			ent: ent,
			id: generateId("rep"),
			created_at: Date.now(),
			delete_next_cycle: false,
		}),
	);

	const featureName = usageToFeatureName({
		usage: numReplaceables,
		feature,
	});

	const replaceableItem = constructPreviewItem({
		priceStr: `${numReplaceables} free ${featureName}`,
		price,
		description: `${product.name} - ${featureName}`,
	});

	return {
		oldItem: prevInvoiceItem,
		newItem,
		newUsageItem: replaceableItem,
		replaceables,
	};
};
