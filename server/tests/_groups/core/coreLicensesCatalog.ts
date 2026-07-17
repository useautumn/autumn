import type { TestGroup } from "../types";

export const coreLicensesCatalog: TestGroup = {
	name: "core-licenses-catalog",
	description: "Complete license catalog update coverage",
	tier: "core",
	paths: ["integration/licenses/catalog-update"],
};
