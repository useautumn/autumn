import { InputGroup, InputGroupAddon, InputGroupInput } from "@autumn/ui";
import { useFormattedNumberInput } from "@/hooks/common/useFormattedNumberInput";

export const amountDisplayValue = (amount: number) =>
	amount === 0 ? "" : amount.toString();

export const CurrencyAmountInput = ({
	displayValue,
	currencyCode,
	onRawChange,
	className,
}: {
	displayValue: string;
	currencyCode: string;
	onRawChange: (raw: string) => void;
	className?: string;
}) => {
	const numberInputProps = useFormattedNumberInput({
		value: displayValue,
		onValueChange: onRawChange,
	});

	return (
		<InputGroup className={className}>
			<InputGroupInput {...numberInputProps} placeholder="0.00" />
			<InputGroupAddon align="inline-end">
				<span className="text-tertiary-foreground text-xs uppercase">
					{currencyCode}
				</span>
			</InputGroupAddon>
		</InputGroup>
	);
};
