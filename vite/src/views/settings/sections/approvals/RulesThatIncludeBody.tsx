import { getBackendErr } from "@/utils/genUtils";
import { IncludedRuleItem } from "./IncludedRuleItem";
import type { RuleAudience } from "./rulesThatInclude";
import { useRulesThatInclude } from "./useRulesThatInclude";

const Caption = ({ children }: { children: string }) => (
	<p className="text-subtle text-xs">{children}</p>
);

export const RulesThatIncludeBody = ({
	audience,
	name,
	roleName,
}: {
	audience: RuleAudience;
	name: string;
	roleName: string | null;
}) => {
	const { items, isLoading, error } = useRulesThatInclude({
		audience,
		name,
		roleName,
	});

	if (isLoading) return null;
	if (error) {
		return (
			<Caption>{getBackendErr(error, "Couldn't load approval rules.")}</Caption>
		);
	}
	if (items.length === 0) {
		return <Caption>{`No approval rules include ${name}.`}</Caption>;
	}
	return (
		<ul className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card">
			{items.map((item) => (
				<IncludedRuleItem key={item.rule.id} {...item} />
			))}
		</ul>
	);
};
