import type React from "react";
import { useId } from "react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./select";

type Option = {
	value: string;
	label: React.ReactNode;
	disabled?: boolean;
};

export const LabelSelect = ({
	label,
	placeholder,
	options,
	children,
	...props
}: {
	label: string | React.ReactElement<typeof HTMLSpanElement>;
	placeholder: string;
	options?: Option[];
	children?: React.ReactNode;
} & React.ComponentProps<typeof Select>) => {
	const selectId = useId();

	return (
		<div>
			<div className="text-form-label block mb-1">{label}</div>
			<Select {...props}>
				<SelectTrigger id={selectId}>
					<SelectValue placeholder={placeholder} />
				</SelectTrigger>
				<SelectContent>
					{options
						? options.map((option) => (
								<SelectItem
									key={option.value}
									value={option.value}
									disabled={option.disabled}
								>
									{option.label}
								</SelectItem>
							))
						: children}
				</SelectContent>
			</Select>
		</div>
	);
};
