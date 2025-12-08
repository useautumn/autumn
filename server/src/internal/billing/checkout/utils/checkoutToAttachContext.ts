import type {
	AttachBranch,
	AttachConfig,
	AttachFunction,
	CheckoutParamsV0,
	Entitlement,
	Price,
} from "@autumn/shared";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv";
import { getAttachParams } from "../../../customers/attach/attachUtils/attachParams/getAttachParams";
import { getAttachBranch } from "../../../customers/attach/attachUtils/getAttachBranch";
import { getAttachConfig } from "../../../customers/attach/attachUtils/getAttachConfig";
import { getAttachFunction } from "../../../customers/attach/attachUtils/getAttachFunction";
import type { AttachFlags } from "../../../customers/attach/models/AttachFlags";
import type { AttachParams } from "../../../customers/cusProducts/AttachParams";

export const checkoutToAttachContext = async ({
	ctx,
	checkoutParams,
}: {
	ctx: AutumnContext;
	checkoutParams: CheckoutParamsV0;
}): Promise<{
	attachParams: AttachParams;
	flags: AttachFlags;
	branch: AttachBranch;
	config: AttachConfig;
	func: AttachFunction;
	customPrices: Price[];
	customEnts: Entitlement[];
}> => {
	const { attachParams, customPrices, customEnts } = await getAttachParams({
		ctx,
		attachBody: checkoutParams,
	});

	const branch = await getAttachBranch({
		ctx,
		attachBody: checkoutParams,
		attachParams,
		fromPreview: true,
	});

	const { flags, config } = await getAttachConfig({
		ctx,
		attachParams,
		attachBody: checkoutParams,
		branch,
	});

	const func = await getAttachFunction({
		branch,
		attachParams,
		attachBody: checkoutParams,
		config,
	});

	return {
		attachParams,
		flags,
		branch,
		config,
		func,
		customPrices: customPrices || [],
		customEnts: customEnts || [],
	};
};
