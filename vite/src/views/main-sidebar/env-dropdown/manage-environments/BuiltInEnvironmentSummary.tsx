import { EnvironmentIcon } from "../EnvironmentIcon";
import { EnvironmentDetailHeader } from "./EnvironmentDetailHeader";

const BUILT_IN_ENVIRONMENTS = {
	production: {
		title: "Production",
		description:
			"Your live environment. Real customers and real payments through Stripe live mode.",
		note: "Production is built in, so it can't be renamed or deleted.",
	},
	defaultSandbox: {
		title: "Sandbox",
		description:
			"The default test environment for your organization, using Stripe test mode.",
		note: "The default sandbox is built in, so it can't be renamed or deleted. Create a custom sandbox for a separate, named test environment.",
	},
} as const;

export const BuiltInEnvironmentSummary = ({
	kind,
}: {
	kind: keyof typeof BUILT_IN_ENVIRONMENTS;
}) => {
	const environment = BUILT_IN_ENVIRONMENTS[kind];

	return (
		<>
			<EnvironmentDetailHeader
				icon={
					<EnvironmentIcon
						isLive={kind === "production"}
						className="size-4 text-muted-foreground"
					/>
				}
				title={environment.title}
				subtitle="Built in"
			/>
			<div className="flex flex-col gap-3 px-5 py-5">
				<p className="text-sm text-foreground">{environment.description}</p>
				<p className="text-sm text-tertiary-foreground">{environment.note}</p>
			</div>
		</>
	);
};
