import type React from "react";
import { useId } from "react";
import { Input } from "./Input";

export const LabelInput = ({
	label,
	description,
	placeholder,
	className,
	...props
}: {
	label: string | React.ReactElement<typeof HTMLSpanElement>;
	description?: string;
	placeholder: string;
} & React.ComponentProps<"input">) => {
	const inputId = useId();

	return (
		<div className={className}>
			<div className="text-form-label block mb-1">{label}</div>
			{description && <p className="text-t3 text-xs mb-1">{description}</p>}
			<Input id={inputId} placeholder={placeholder} {...props} />
		</div>
	);
};
