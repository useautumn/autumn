import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/v2/buttons/Button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/v2/cards/Card";
import { FormLabel } from "@/components/v2/form/FormLabel";

interface RevenueCatConnectionCardProps {
	isLoading: boolean;
	statusDescription: string;
	dashboardUrl: string;
	currentApiKey?: string;
	env: string;
	onApiKeyClick: () => void;
	onProjectIdClick: () => void;
	onMapProductsClick: () => void;
	currentProjectId?: string;
}

export const RevenueCatConnectionCard = ({
	isLoading,
	statusDescription,
	dashboardUrl,
	currentApiKey,
	env,
	onApiKeyClick,
	onProjectIdClick,
	onMapProductsClick,
	currentProjectId,
}: RevenueCatConnectionCardProps) => {
	return (
		<Card className="shadow-none bg-interactive-secondary">
			<CardHeader>
				<CardTitle>Connect your RevenueCat account</CardTitle>
				{isLoading ? (
					<div className="space-y-2">
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-3/4" />
					</div>
				) : (
					statusDescription && (
						<CardDescription>
							{statusDescription}
							{dashboardUrl && (
								<span className="text-muted-foreground">
									{" "}
									Visit the RevenueCat dashboard{" "}
									<a
										href={dashboardUrl}
										target="_blank"
										rel="noopener noreferrer"
										className="underline text-primary"
									>
										here
									</a>
								</span>
							)}
						</CardDescription>
					)
				)}
			</CardHeader>
			<CardContent className="flex flex-col gap-2">
				{currentApiKey && (
					<div className="mb-0">
						<FormLabel className="mb-0 text-body">
							Current API key:{" "}
							<code className="bg-interactive-secondary px-2 py-1 rounded">
								{currentApiKey}
							</code>
						</FormLabel>
					</div>
				)}
				{currentProjectId && (
					<div className="mb-2">
						<FormLabel className="mb-0 text-body">
							Current project ID:{" "}
							<code className="bg-interactive-secondary px-2 py-1 rounded">
								{currentProjectId}
							</code>
						</FormLabel>
					</div>
				)}
				<div className="flex gap-2">
					<Button variant="secondary" onClick={onApiKeyClick}>
						{currentApiKey ? "Update API Key" : "Add API Key"}
					</Button>
					<Button variant="secondary" onClick={onProjectIdClick}>
						{currentProjectId ? "Update Project ID" : "Add Project ID"}
					</Button>
					<Button variant="primary" onClick={onMapProductsClick}>
						Map Products
					</Button>
				</div>
			</CardContent>
		</Card>
	);
};
