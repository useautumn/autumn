import { Card, CardContent } from "@/components/v2/cards/Card";
import { PlanCardHeader } from "./PlanCardHeader";
import { PlanFeatureList } from "./PlanFeatureList";

export default function PlanCard() {
	return (
		<Card className="min-w-sm w-[70%] max-w-xl mx-4 bg-card">
			<PlanCardHeader />
			<CardContent>
				<PlanFeatureList />
			</CardContent>
		</Card>
	);
}
