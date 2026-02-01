import { Coins } from "lucide-react";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/v2/cards/Card";
import type { AgentFeature } from "../pricingAgentUtils";

interface PreviewCreditSchemaCardProps {
	creditFeature: AgentFeature;
	allFeatures: AgentFeature[];
}

/**
 * Displays a card showing how a credit system maps to underlying metered features
 */
export function PreviewCreditSchemaCard({
	creditFeature,
	allFeatures,
}: PreviewCreditSchemaCardProps) {
	const creditSchema = creditFeature.credit_schema;

	if (!creditSchema || creditSchema.length === 0) {
		return null;
	}

	const creditDisplayName =
		creditFeature.name ?? creditFeature.display?.plural ?? creditFeature.id;
	const creditSingular = creditFeature.display?.singular ?? "credit";

	return (
		<Card className="w-[280px] bg-background flex flex-col gap-0 rounded-xl">
			<CardHeader className="">
				<div className="flex items-center gap-2">
					<div className=" rounded-md">
						<Coins className="size-3.5 text-amber-500" />
					</div>
					<CardTitle className="text-sm">{creditDisplayName}</CardTitle>
				</div>
			</CardHeader>

			<CardContent className="pt-1">
				<div className="space-y-1.5">
					{creditSchema.map((mapping) => {
						const targetFeature = allFeatures.find(
							(f) => f.id === mapping.metered_feature_id,
						);
						const targetName =
							targetFeature?.name ??
							targetFeature?.display?.singular ??
							mapping.metered_feature_id;

						return (
							<div
								key={mapping.metered_feature_id}
								className="flex items-center justify-between px-2 py-1 rounded-md"
							>
								<span className="text-xs text-foreground truncate">
									{targetName}
								</span>
								<span className="text-xs text-t2 font-medium shrink-0 ml-2">
									{mapping.credit_cost}{" "}
									{mapping.credit_cost === 1
										? creditSingular
										: (creditFeature.display?.plural ?? "credits")}
								</span>
							</div>
						);
					})}
				</div>
			</CardContent>
		</Card>
	);
}
