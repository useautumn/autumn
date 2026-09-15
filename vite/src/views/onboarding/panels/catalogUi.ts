import { pushPage } from "@/utils/genUtils";

export const catalogCardClassName =
	"border bg-interactive-secondary transition-colors hover:bg-interactive-secondary-hover";

export const catalogGridClassName =
	"grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4";

export const planPagePath = (planId: string) =>
	pushPage({ path: `/products/${planId}` });

export const featurePagePath = ({ featureId }: { featureId?: string } = {}) =>
	pushPage({
		path: "/products",
		queryParams: { tab: "features", feature: featureId },
	});
