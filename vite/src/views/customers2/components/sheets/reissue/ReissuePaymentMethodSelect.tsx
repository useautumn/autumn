import {
	FormLabel,
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@autumn/ui";
import { useCustomerPaymentMethodsQuery } from "@/views/customers2/hooks/useCustomerPaymentMethodsQuery";
import { paymentMethodToLabel } from "./paymentMethodToLabel";

const DEFAULT_PAYMENT_METHOD = "default";

export function ReissuePaymentMethodSelect({
	customerId,
	value,
	onValueChange,
}: {
	customerId: string | undefined;
	value: string | null;
	onValueChange: (paymentMethodId: string | null) => void;
}) {
	const { paymentMethods, isLoading } = useCustomerPaymentMethodsQuery({
		customerId,
	});
	const options = [
		{ label: "Default payment method", value: DEFAULT_PAYMENT_METHOD },
		...paymentMethods.map((paymentMethod) => ({
			label: paymentMethodToLabel(paymentMethod),
			value: paymentMethod.id,
		})),
	];
	const selected = value ?? DEFAULT_PAYMENT_METHOD;

	return (
		<div className="space-y-1.5">
			<FormLabel>Charge to</FormLabel>
			<Select
				value={selected}
				items={options}
				disabled={isLoading}
				onValueChange={(next) =>
					onValueChange(
						next === DEFAULT_PAYMENT_METHOD || !next ? null : String(next),
					)
				}
			>
				<SelectTrigger className="w-full" aria-label="Charge to">
					<SelectValue>
						{options.find((option) => option.value === selected)?.label ??
							"Default payment method"}
					</SelectValue>
				</SelectTrigger>
				<SelectContent>
					<SelectGroup>
						{options.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectGroup>
				</SelectContent>
			</Select>
		</div>
	);
}
