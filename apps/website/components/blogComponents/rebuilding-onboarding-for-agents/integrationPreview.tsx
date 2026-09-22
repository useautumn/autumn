import styles from "./onboardingDiagram.module.css";

export function IntegrationPreview() {
	return (
		<div className={styles.integrationPreview}>
			<div className={styles.appHeader}>
				<span className={styles.orgIcon}>A</span>
				<strong>Acme Studio</strong>
				<span className={styles.proBadge}>Pro</span>
			</div>
			<div className={styles.appBody}>
				<div className={styles.balanceRow}>
					<span>Alice</span>
					<span className={styles.creditBalance}>99</span>
					<span>credits</span>
				</div>
				<div className={styles.message}>Summarize today’s updates.</div>
				<div className={styles.reply}>
					<span aria-hidden="true">✳</span>Here’s your summary.
				</div>
			</div>
		</div>
	);
}
