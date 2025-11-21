import {
	type CreateProductV2Params,
	type FullProduct,
	isDefaultTrial,
	isDefaultTrialV2,
	isFreeProductV2,
	isOneOffProductV2,
	RecaseError,
	type UpdateProductV2Params,
} from "@autumn/shared";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv";
import { ProductService } from "../../ProductService";
import {
	getGroupToDefaults,
	isFreeProduct,
	isOneOff,
} from "../../productUtils";

export const disableCurrentDefault = async ({
	ctx,
	body,
	curProduct,
	type,
}: {
	ctx: AutumnContext;
	body: CreateProductV2Params | UpdateProductV2Params;
	curProduct?: FullProduct;
	type: "free" | "default_trial";
}) => {
	const { db, org, env, logger } = ctx;

	let defaultProds = await ProductService.listDefault({
		db,
		orgId: org.id,
		env,
	});

	defaultProds = defaultProds.filter((prod) => prod.id !== curProduct?.id);

	if (defaultProds.length === 0) return;

	const defaults = getGroupToDefaults({
		defaultProds,
	})?.[body.group || ""];

	if (type === "default_trial") {
		const curDefault = defaults?.defaultTrial;
		if (curDefault) {
			throw new RecaseError({
				message: `You have another default trial product in this group (${curDefault.id}). Please remove default from that product first.`,
			});
		}
		// if (curDefault) {
		// 	logger.info(
		// 		`Disabling trial on cur default trial product: ${curDefault.id}`,
		// 	);
		// 	await ProductService.updateByInternalId({
		// 		db,
		// 		internalId: curDefault.internal_id,
		// 		update: { is_default: false },
		// 	});
		// }
	} else if (type === "free") {
		const curDefault = defaults?.free;

		if (curDefault) {
			throw new RecaseError({
				message: `You have another default free product (${curDefault.id}). Please remove default from that product first.`,
			});
		}
		// if (curDefault) {
		// 	logger.info(`Disabling trial on cur default product: ${curDefault.id}`);
		// 	await ProductService.updateByInternalId({
		// 		db,
		// 		internalId: curDefault.internal_id,
		// 		update: { is_default: false },
		// 	});
		// }
	}
};

export const validateDefaultFlag = async ({
	ctx,
	body,
	curProduct,
}: {
	ctx: AutumnContext;
	body: CreateProductV2Params | UpdateProductV2Params;
	curProduct?: FullProduct;
}) => {
	const validate = (): { type: "free" | "default_trial" | undefined } => {
		const isDefault = body.is_default || curProduct?.is_default || false;
		if (!isDefault) return { type: undefined };

		// If default, check if there are any prices...?
		const isFree = body.items
			? isFreeProductV2({ items: body.items })
			: isFreeProduct(curProduct?.prices || []);

		if (isFree) return { type: "free" };

		// 1. Check if it's a one off product
		const isOneOffProduct = body.items
			? isOneOffProductV2({ items: body.items })
			: isOneOff(curProduct?.prices || []);

		if (isOneOffProduct) {
			throw new RecaseError({
				message: `Cannot make a plan default if it has prices on it.`,
			});
		}

		// 2. Check if it is default trial
		const freeTrial = body.free_trial || curProduct?.free_trial;
		const defaultTrial = body.items
			? isDefaultTrialV2({
					freeTrial: freeTrial ?? undefined,
					items: body.items,
					isDefault,
				})
			: isDefaultTrial({
					freeTrial: freeTrial ?? undefined,
					isDefault,
					prices: curProduct?.prices || [],
				});

		if (defaultTrial) return { type: "default_trial" };

		throw new RecaseError({
			message: `Cannot make a plan default if it has prices on it.`,
		});
	};

	const { type } = validate();

	if (type) {
		await disableCurrentDefault({
			ctx,
			body,
			curProduct,
			type,
		});
	}
};
