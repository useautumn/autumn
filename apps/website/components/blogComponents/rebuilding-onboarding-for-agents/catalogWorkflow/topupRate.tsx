import styles from "./catalogTopupDiagram.module.css";

export function TopupRate({ amount }: { amount: number }) {
	return (
		<div className={styles.topupRate}>
			<strong>${amount}</strong>
			<span>per 100 credits</span>
		</div>
	);
}
