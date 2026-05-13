import type { Feature } from "../featureModels/featureModels.js";
import type { Organization } from "./orgTable.js";

export type FullOrg = Organization & {
	features: Feature[];
};
