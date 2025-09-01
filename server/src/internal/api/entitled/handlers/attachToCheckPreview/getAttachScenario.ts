import {
	AttachBranch,
	type AttachPreview,
	AttachScenario,
	type FullProduct,
} from "@autumn/shared";
import { isFreeProduct } from "@/internal/products/productUtils.js";

export const getAttachScenario = async ({
	preview,
	product,
}: {
	preview: AttachPreview;
	product: FullProduct;
}) => {
	const branch = preview.branch;

	if (
		branch === AttachBranch.New ||
		branch === AttachBranch.OneOff ||
		branch === AttachBranch.AddOn
	) {
		return AttachScenario.New;
	}

	if (
		branch === AttachBranch.MainIsFree ||
		branch === AttachBranch.MainIsTrial ||
		branch === AttachBranch.Upgrade
	) {
		return AttachScenario.Upgrade;
	}

	if (branch === AttachBranch.Downgrade) {
		// return AttachScenario.Downgrade;
		if (isFreeProduct(product.prices)) {
			return AttachScenario.Cancel;
		} else {
			return AttachScenario.Downgrade;
		}
	}

	if (branch === AttachBranch.Renew) {
		return AttachScenario.Renew;
	}

	return AttachScenario.New;
};
