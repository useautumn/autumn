import apiKeysSvg from "./api-keys.svg";
import customersSvg from "./customers.svg";
import featuresSvg from "./features.svg";
import plansSvg from "./plans.svg";

export const EmptyState = ({
	type,
	actionButton,
}: {
	type: "plans" | "features" | "customers" | "api-keys";
	actionButton?: React.ReactNode;
}) => {
	const getEmptyStateContent = () => {
		switch (type) {
			case "plans":
				return {
					title: "Create your first Plan",
					description:
						"Plans define your pricing tiers, usage limits and feature permissions",
					svg: plansSvg,
				};
			case "features":
				return {
					title: "Features",
					description:
						"Create features to represent what your customers get access to, then package them into plans",
					svg: featuresSvg,
				};
			case "customers":
				return {
					title: "Customers",
					description:
						"Create customers via the Autumn API for users or organizations that can purchase plans",
					svg: customersSvg,
				};
			case "api-keys":
				return {
					title: "API Keys",
					description:
						"Create an API key to authenticate requests to the Autumn API",
					svg: apiKeysSvg,
				};
		}
	};

	const { title, description, svg } = getEmptyStateContent();

	return (
		<div className="flex flex-col items-center justify-center gap-4 p-8 text-sm pt-20">
			<img src={svg} alt={title} className="h-20" />
			<div className="space-y-1">
				<h2 className="text-t2 font-medium text-center">{title}</h2>
				<p className="text-t4 w-xs text-wrap text-center">{description}</p>
			</div>
			{actionButton && actionButton}
		</div>
	);
};
