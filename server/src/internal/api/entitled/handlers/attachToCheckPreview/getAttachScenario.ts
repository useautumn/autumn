import { isFreeProduct } from "@/internal/products/productUtils.js";
import {
	AttachBranch,
	AttachPreview,
	AttachScenario,
	FullProduct,
} from "@autumn/shared";

export const getAttachScenario = async ({
	preview,
	product,
}: {
	preview: AttachPreview;
	product: FullProduct;
}) => {
	let branch = preview.branch;

	if (
		branch == AttachBranch.New ||
		branch == AttachBranch.OneOff ||
		branch == AttachBranch.AddOn
	) {
		return AttachScenario.New;
	}

	if (
		branch == AttachBranch.MainIsFree ||
		branch == AttachBranch.MainIsTrial ||
		branch == AttachBranch.Upgrade
	) {
		return AttachScenario.Upgrade;
	}

	if (branch == AttachBranch.Downgrade) {
		// return AttachScenario.Downgrade;
		if (isFreeProduct(product.prices)) {
			return AttachScenario.Cancel;
		} else {
			return AttachScenario.Downgrade;
		}
	}

	if (branch == AttachBranch.Renew) {
		return AttachScenario.Renew;
	}

	return AttachScenario.New;
};
