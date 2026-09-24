import styles from "./onboardingDiagram.module.css";

const MEMBERS = ["Alice", "Bob", "Charlie"];

export function CatalogPreview() {
	return (
		<div className={styles.catalogPreview}>
			<div className={styles.planHeader}>
				<strong>Pro</strong>
				<span>
					<b>$20</b> / seat / mo
				</span>
			</div>
			<div className={styles.memberGrid}>
				{MEMBERS.map((name) => (
					<div key={name} className={styles.memberCard}>
						<span className={styles.memberName}>{name}</span>
						<strong>100</strong>
						<span className={styles.memberUnit}>credits / mo</span>
					</div>
				))}
			</div>
			<div className={styles.poolConnector} aria-hidden="true">
				<span />
				<span />
				<span />
			</div>
			<div className={styles.sharedPool}>
				<span className={styles.poolIcon} aria-hidden="true">
					+
				</span>
				<span>Shared prepaid credits</span>
				<strong>1,000</strong>
			</div>
		</div>
	);
}
