import type { SubjectState } from "@autumn/balance-engine";

export type SubjectStateMeasure = {
	bytes: number;
	rows: {
		customerProducts: number;
		customerPrices: number;
		customerEntitlements: number;
		rollovers: number;
		replaceables: number;
		usageWindows: number;
		openLocks: number;
		pooledBalances: number;
		customerLicenses: number;
	};
};

export function measureSubjectState({
	state,
}: {
	state: SubjectState;
}): SubjectStateMeasure {
	return {
		bytes: Buffer.byteLength(JSON.stringify(state), "utf8"),
		rows: {
			customerProducts: state.customerProducts.length,
			customerPrices: state.customerPrices.length,
			customerEntitlements: state.customerEntitlements.length,
			rollovers: state.rollovers.length,
			replaceables: state.replaceables.length,
			usageWindows: state.usageWindows.length,
			openLocks: state.openLocks.length,
			pooledBalances: state.pooledBalances.length,
			customerLicenses: state.customerLicenses.length,
		},
	};
}
