import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { IconButton } from "@/components/v2/buttons/IconButton";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/v2/cards/Card";
import { cn } from "@/lib/utils";
import { CodeSpan } from "@/views/onboarding2/integrate/components/CodeSpan";
import { SectionHeader } from "./SectionHeader";

interface NextStepCardProps {
	title: string;
	description: React.ReactNode;
	href: string;
}

const NextStepCard = ({ title, description, href }: NextStepCardProps) => {
	return (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			className="block group"
		>
			<Card
				className={cn(
					"group gap-1 my-0 cursor-pointer",
					"hover:!bg-hover-primary hover:border-primary",
				)}
			>
				<CardHeader className="flex flex-row items-center justify-between">
					<CardTitle className="text-sub text-t9">{title}</CardTitle>
					<IconButton
						icon={<ArrowSquareOutIcon className="ml-auto" />}
						variant="skeleton"
						disableActive
						className="pointer-events-none"
					/>
				</CardHeader>
				<CardContent>
					<div className="text-body-secondary">{description}</div>
				</CardContent>
			</Card>
		</a>
	);
};

export const NextStepsSection = () => {
	return (
		<div className="flex flex-col gap-4 pb-4">
			<SectionHeader
				stepNumber={8}
				title={<span>Next Steps</span>}
				description="Congrats on setting up Autumn! The next steps are to learn how to use Autumn to check if a user has access to features in your application, and track usage for those features. Learn how to do so here.√"
			/>

			<div className="pl-[32px] flex flex-col gap-6">
				<div className="flex flex-col gap-2.5">
					<NextStepCard
						title="Checking Access"
						description={
							<>
								Learn how to check feature access with the{" "}
								<CodeSpan className="text-body-secondary">check</CodeSpan> route
							</>
						}
						href="https://docs.useautumn.com/features/check"
					/>

					<NextStepCard
						title="Tracking Usage"
						description={
							<>
								Keep track of your customer's feature usage with the{" "}
								<CodeSpan className="text-body-secondary">track</CodeSpan> route
							</>
						}
						href="https://docs.useautumn.com/features/tracking-usage"
					/>

					<NextStepCard
						title="Balances"
						description="Learn about feature balances for your metered features"
						href="https://docs.useautumn.com/features/balances"
					/>

					<NextStepCard
						title="Credits"
						description="Learn about credits and how to manage feature credits"
						href="https://docs.useautumn.com/features/credits"
					/>

					<NextStepCard
						title="Entities"
						description="Learn how to use feature entities to track balances per separate entity, such as a user or a workspace"
						href="https://docs.useautumn.com/features/feature-entities"
					/>
				</div>
			</div>
		</div>
	);
};
