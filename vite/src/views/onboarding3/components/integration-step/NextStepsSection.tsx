import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { IconButton } from "@/components/v2/buttons/IconButton";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/v2/cards/Card";
import { CodeSpan } from "@/views/onboarding2/integrate/components/CodeSpan";
import { SectionHeader } from "./SectionHeader";

export const NextStepsSection = () => {
	return (
		<div className="flex flex-col gap-4">
			<SectionHeader
				stepNumber={8}
				title={<span>Next Steps</span>}
				description="Congrats on setting up Autumn! The next steps are to learn how to use Autumn to check if a user has access to features in your application, and track usage for those features. Learn how to do so here.√"
			/>

			<div className="pl-[32px] flex flex-col gap-6">
				<div className="flex flex-col gap-2.5">
					<Card className="gap-1 my-0">
						<CardHeader className="flex flex-row items-center justify-between">
							<CardTitle className="text-sub text-t9">
								Checking Access
							</CardTitle>
							<a
								href="https://docs.useautumn.com/features/check"
								target="_blank"
								rel="noopener noreferrer"
							>
								<IconButton
									icon={<ArrowSquareOutIcon className="ml-auto" />}
									variant={"skeleton"}
								></IconButton>
							</a>
						</CardHeader>
						<CardContent>
							<span className="text-body-secondary">
								Learn how to check feature access with the{" "}
							</span>
							<CodeSpan className="text-body-secondary">check</CodeSpan>
							<span className="text-body-secondary"> route</span>
						</CardContent>
					</Card>

					<Card className="gap-1 my-0">
						<CardHeader className="flex flex-row items-center justify-between">
							<CardTitle className="text-sub text-t9">Tracking Usage</CardTitle>
							<a
								href="https://docs.useautumn.com/features/tracking-usage"
								target="_blank"
								rel="noopener noreferrer"
							>
								<IconButton
									icon={<ArrowSquareOutIcon className="ml-auto" />}
									variant={"skeleton"}
								></IconButton>
							</a>
						</CardHeader>
						<CardContent>
							<span className="text-body-secondary">
								Keep track of your customer's feature usage with the{" "}
							</span>
							<CodeSpan className="text-body-secondary">track</CodeSpan>
							<span className="text-body-secondary"> route</span>
						</CardContent>
					</Card>

					<Card className="gap-1 my-0">
						<CardHeader className="flex flex-row items-center justify-between">
							<CardTitle className="text-sub text-t9">Balances</CardTitle>
							<a
								href="https://docs.useautumn.com/features/balances"
								target="_blank"
								rel="noopener noreferrer"
							>
								<IconButton
									icon={<ArrowSquareOutIcon className="ml-auto" />}
									variant={"skeleton"}
								></IconButton>
							</a>
						</CardHeader>
						<CardContent>
							<span className="text-body-secondary">
								Learn about feature balances for your metered features
							</span>
						</CardContent>
					</Card>

					<Card className="gap-1 my-0">
						<CardHeader className="flex flex-row items-center justify-between">
							<CardTitle className="text-sub text-t9">Credits</CardTitle>
							<a
								href="https://docs.useautumn.com/features/credits"
								target="_blank"
								rel="noopener noreferrer"
							>
								<IconButton
									icon={<ArrowSquareOutIcon className="ml-auto" />}
									variant={"skeleton"}
								></IconButton>
							</a>
						</CardHeader>
						<CardContent>
							<span className="text-body-secondary">
								Learn about credits and how to manage feature credits
							</span>
						</CardContent>
					</Card>

					<Card className="gap-1 my-0">
						<CardHeader className="flex flex-row items-center justify-between">
							<CardTitle className="text-sub text-t9">Entities</CardTitle>
							<a
								href="https://docs.useautumn.com/features/feature-entities"
								target="_blank"
								rel="noopener noreferrer"
							>
								<IconButton
									icon={<ArrowSquareOutIcon className="ml-auto" />}
									variant={"skeleton"}
								></IconButton>
							</a>
						</CardHeader>
						<CardContent>
							<span className="text-body-secondary">
								Learn how to use feature entities to track balances per separate
								entity, such as a user or a workspace
							</span>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
};
