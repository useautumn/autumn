import { cn } from "@/lib/utils";
import styles from "./catalogTopupDiagram.module.css";
import workflow from "./catalogWorkflow.module.css";
import { TopupPricingCard } from "./topupPricingCard";
import { TopupRate } from "./topupRate";

const PLANS = [
	{ name: "Pro", credits: "200", topupPrice: 10 },
	{ name: "Business", credits: "1,000", topupPrice: 8 },
];

export function CatalogTopupDiagram() {
	return (
		<figure
			className={cn("not-prose", workflow.diagram, styles.topupDiagram)}
			aria-label="Plan-specific pricing: Pro includes 200 monthly credits with top-ups at $10 per 100 credits; Business includes 1,000 with top-ups at $8 per 100. Shared pricing: the same two plans use one top-up add-on at $10 per 100 credits."
		>
			<div className={styles.pricingComparison}>
				<section aria-label="Plan-specific pricing">
					<h4 className={styles.comparisonHeading}>Plan-specific pricing</h4>
					<div className={styles.pricingPair}>
						{PLANS.map((plan) => (
							<TopupPricingCard key={plan.name} {...plan} />
						))}
					</div>
				</section>
				<section aria-label="Shared pricing">
					<h4 className={styles.comparisonHeading}>Shared pricing</h4>
					<div className={styles.pricingPair}>
						{PLANS.map(({ name, credits }) => (
							<TopupPricingCard key={name} name={name} credits={credits} />
						))}
					</div>
					<svg
						className={styles.topupConnector}
						viewBox="0 0 327 22"
						fill="none"
						aria-hidden="true"
					>
						<path d="M79.25 0V4Q79.25 12 87.25 12H239.75Q247.75 12 247.75 4V0M163.5 12V22" />
					</svg>
					<div className={styles.sharedTopup}>
						<div>
							<h5>Top-up plan</h5>
							<span className={styles.topupLabel}>Auto top-up</span>
						</div>
						<TopupRate amount={10} />
					</div>
				</section>
			</div>
		</figure>
	);
}
