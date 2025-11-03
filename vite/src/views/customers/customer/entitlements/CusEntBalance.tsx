import {
	AllowanceType,
	FeatureType,
	type FullCusEntWithFullCusProduct,
} from "@autumn/shared";
import { useCustomerContext } from "../CustomerContext";

const BalanceWrapper = ({ children }: { children: React.ReactNode }) => {
	return (
		<div className="flex items-center font-mono font-medium rounded-md border-b border-stone-300 border-dashed ">
			{children}
		</div>
	);
};

export const CusEntBalance = ({
	cusEnt,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
}) => {
	const { entityId } = useCustomerContext();
	const ent = cusEnt.entitlement;
	const feature = ent.feature;
	const rollovers = cusEnt.rollovers;

	if (feature.type === FeatureType.Boolean) {
		return <></>;
	}

	if (ent.allowance_type === AllowanceType.Unlimited) {
		return <BalanceWrapper>Unlimited</BalanceWrapper>;
	}

	if (entityId && cusEnt.entities?.[entityId]) {
		const entityBalance = cusEnt.entities?.[entityId]?.balance;
		const rolloverAmount = rollovers
			.filter((x) => x.entities && x.entities[entityId])
			.reduce(
				(sum, rollover) => sum + (rollover.entities?.[entityId]?.balance || 0),
				0,
			);

		return (
			<BalanceWrapper>
				<p>
					{entityBalance}
					{rolloverAmount > 0 && (
						<span className="text-t3">
							{" + "}
							{rolloverAmount} (rolled over)
						</span>
					)}
				</p>
			</BalanceWrapper>
		);
	}

	if (cusEnt.entities) {
		const totalBalance = Object.values(cusEnt.entities).reduce(
			(sum, entity) => sum + (entity.balance || 0),
			0,
		);

		const rolloverAmount = cusEnt.rollovers.reduce((sum, rollover) => {
			// Add global rollover balance
			return (
				sum +
				Object.values(rollover.entities).reduce(
					(entitySum: number, entity: any) => entitySum + (entity.balance || 0),
					0,
				)
			);
		}, 0);

		return (
			<BalanceWrapper>
				<p>
					{totalBalance}
					{rolloverAmount > 0 && (
						<span className="text-t3">
							{" + "}
							{rolloverAmount} (rolled over)
						</span>
					)}
				</p>
			</BalanceWrapper>
		);
	}

	const rolloverAmount = cusEnt.rollovers.reduce((sum, rollover) => {
		return sum + (rollover.balance || 0);
	}, 0);

	return (
		<BalanceWrapper>
			<p>
				{cusEnt.balance}
				{rolloverAmount > 0 && (
					<span className="text-t3"> + {rolloverAmount} (rolled over)</span>
				)}
				{cusEnt.replaceables.length > 0 && (
					<span className="text-t3">
						{` (${cusEnt.replaceables.length} free)`}
					</span>
				)}
			</p>
		</BalanceWrapper>
	);
};
