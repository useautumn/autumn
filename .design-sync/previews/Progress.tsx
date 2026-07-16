import { Progress, ProgressLabel, ProgressValue } from "@autumn/ui";

export const Default = () => (
	<div className="w-full max-w-sm">
		<Progress value={64}>
			<ProgressLabel>API calls</ProgressLabel>
			<ProgressValue />
		</Progress>
	</div>
);

export const FeatureUsage = () => (
	<div className="flex w-full max-w-sm flex-col gap-5">
		<Progress value={24}>
			<ProgressLabel>Seats</ProgressLabel>
			<ProgressValue>{() => "24 / 100"}</ProgressValue>
		</Progress>
		<Progress value={62}>
			<ProgressLabel>Storage</ProgressLabel>
			<ProgressValue>{() => "312 / 500 GB"}</ProgressValue>
		</Progress>
		<Progress value={96}>
			<ProgressLabel>API calls</ProgressLabel>
			<ProgressValue>{() => "96,204 / 100,000"}</ProgressValue>
		</Progress>
	</div>
);

export const LabelOnly = () => (
	<div className="w-full max-w-sm">
		<Progress value={38}>
			<ProgressLabel>Included credits used</ProgressLabel>
		</Progress>
	</div>
);

export const NearLimit = () => (
	<div className="w-full max-w-sm">
		<Progress value={98}>
			<ProgressLabel>Included credits</ProgressLabel>
			<ProgressValue>{() => "9,800 / 10,000"}</ProgressValue>
		</Progress>
	</div>
);
