import { CheckCircleIcon, XCircleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/v2/buttons/Button";

export function BooleanPill({
	value,
	onChange,
}: {
	value: boolean;
	onChange: (value: boolean) => void;
}) {
	return (
		<Button variant="secondary" size="sm" onClick={() => onChange(!value)}>
			{value ? (
				<CheckCircleIcon size={14} weight="fill" className="text-green-500" />
			) : (
				<XCircleIcon size={14} weight="fill" className="text-t3" />
			)}
			{value ? "True" : "False"}
		</Button>
	);
}
