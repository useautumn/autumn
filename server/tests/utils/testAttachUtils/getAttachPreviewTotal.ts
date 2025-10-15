import { type FeatureOptions, LegacyVersion } from "@autumn/shared";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { getAttachTotal } from "./testAttachUtils.js";

export const getAttachPreviewTotal = async ({
	customerId,
	productId,
	entityId,
	options,
}: {
	customerId: string;
	productId: string;
	entityId: string;
	options?: FeatureOptions[];
}) => {
	const autumn = new AutumnInt({ version: LegacyVersion.v1_2 });
	const preview = await autumn.attachPreview({
		customer_id: customerId,
		product_id: productId,
		entity_id: entityId,
	});

	const optionsCopy = structuredClone(options);
	const total = getAttachTotal({
		preview,
		options: optionsCopy,
	});

	return total;
};
