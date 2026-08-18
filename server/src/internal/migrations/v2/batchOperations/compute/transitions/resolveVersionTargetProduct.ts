import { type FullProduct, productKeyToString } from "@autumn/shared";
import type { BatchMigrationRejection } from "../../types/index.js";

export const resolveVersionTargetProduct = ({
	productsByPlanVersion,
	fromProduct,
	targetVersion,
	opIndex,
}: {
	productsByPlanVersion: ReadonlyMap<string, FullProduct>;
	fromProduct: FullProduct;
	targetVersion: number | undefined;
	opIndex: number;
}): {
	targetProduct?: FullProduct;
	rejections: BatchMigrationRejection[];
} => {
	if (targetVersion === undefined) {
		return { targetProduct: fromProduct, rejections: [] };
	}

	const targetProduct = productsByPlanVersion.get(
		productKeyToString({
			productKey: { planId: fromProduct.id, version: targetVersion },
		}),
	);
	if (targetProduct) return { targetProduct, rejections: [] };

	return {
		rejections: [
			{
				code: "missing_target_version",
				opIndex,
				planId: fromProduct.id,
				message: `Plan ${fromProduct.id} has no catalog version ${targetVersion}.`,
				details: {
					fromVersion: fromProduct.version,
					targetVersion,
				},
			},
		],
	};
};
