import { CheckCircleIcon, XCircleIcon } from "@phosphor-icons/react";

export function BooleanPill({
	value,
	onChange,
}: {
	value: boolean;
	onChange: (value: boolean) => void;
}) {
	return (
		<button
			type="button"
			onClick={() => onChange(!value)}
			className="flex items-center gap-2 h-8 px-3 rounded-xl input-base input-state-open-tiny cursor-pointer w-full text-sm"
		>
			{value ? (
				<CheckCircleIcon size={14} weight="fill" className="text-green-500" />
			) : (
				<XCircleIcon
					size={14}
					weight="fill"
					className="text-tertiary-foreground"
				/>
			)}
			{value ? "True" : "False"}
		</button>
	);
}
