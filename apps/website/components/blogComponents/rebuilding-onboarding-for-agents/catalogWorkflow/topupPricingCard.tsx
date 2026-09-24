import styles from "./catalogTopupDiagram.module.css";
import { TopupRate } from "./topupRate";

export function TopupPricingCard({
	name,
	credits,
	topupPrice,
}: {
	name: string;
	credits: string;
	topupPrice?: number;
}) {
	return (
		<div className={styles.pricingCard}>
			<div className={styles.planAllowance}>
				<h5>{name}</h5>
				<div className={styles.creditAllowance}>
					<strong className={styles.includedCredits}>{credits}</strong>
					<span className={styles.creditCaption}>credits / month</span>
				</div>
			</div>
			{topupPrice !== undefined && (
				<div className={styles.planTopup}>
					<span className={styles.topupLabel}>Auto top-up</span>
					<TopupRate amount={topupPrice} />
				</div>
			)}
		</div>
	);
}
