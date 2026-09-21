import { cn } from "@/lib/utils";
import { CatalogPreview } from "./catalogPreview";
import { IntegrationPreview } from "./integrationPreview";
import { OnboardingCode } from "./onboardingCode";
import { CATALOG_CODE, INTEGRATION_CODE } from "./onboardingCodeExamples";
import styles from "./onboardingDiagram.module.css";

export function OnboardingDiagram() {
	return (
		<figure
			className={cn("not-prose", styles.diagram)}
			aria-label="Build a Pro catalog with $20 seats, 100 monthly credits per member, and shared prepaid credits, then integrate it into your app."
		>
			<section className={styles.row} aria-label="Build your catalog">
				<div className={styles.rowHeading}>
					<h4>
						<span className={styles.partLabel}>Part 1</span>Build your catalog
					</h4>
				</div>
				<div className={styles.rowContent}>
					<OnboardingCode filename="autumn.config.ts" code={CATALOG_CODE} />
					<CatalogPreview />
				</div>
			</section>
			<section className={styles.row} aria-label="Integrate Autumn">
				<div className={styles.rowHeading}>
					<h4>
						<span className={styles.partLabel}>Part 2</span>Integrate Autumn
					</h4>
				</div>
				<div className={styles.rowContent}>
					<OnboardingCode
						filename="server/billing.ts"
						code={INTEGRATION_CODE}
					/>
					<IntegrationPreview />
				</div>
			</section>
		</figure>
	);
}
