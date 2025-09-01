import { type Feature, getFeatureName } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { EntityService } from "@/internal/api/entities/EntityService.js";

export const getEntityInvoiceDescription = async ({
	db,
	internalEntityId,
	features,
	logger,
}: {
	db: DrizzleCli;
	internalEntityId: string;
	features: Feature[];
	logger: any;
}) => {
	try {
		const entity = await EntityService.getByInternalId({
			db,
			internalId: internalEntityId,
		});

		const feature = features.find(
			(f) => f.internal_id === entity?.internal_feature_id,
		);

		let entDetails = "";
		if (entity.name) {
			entDetails = `${entity.name}${entity.id ? ` (ID: ${entity.id})` : ""}`;
		} else if (entity.id) {
			entDetails = `${entity.id}`;
		}

		if (feature && entDetails) {
			const featureName = getFeatureName({
				feature,
				plural: false,
				capitalize: true,
			});
			return `${featureName}: ${entDetails}`;
		}

		return "";
	} catch (error) {
		logger.error(`Failed to get entity invoice description`, { error });
		return "";
	}
};
