import { nullableObjectField } from "./nullableObjectField";
import { numberField } from "./numberField";

export const refundField = <Parent>({
	label,
	read,
}: {
	label: string;
	read: (parent: Parent) => { amount: number } | null;
}) =>
	nullableObjectField<Parent, { amount: number }>({
		label,
		read,
		fields: {
			amount: numberField({ label, read: (refund) => refund.amount }),
		},
		describeValue: (refund) => String(refund.amount),
	});
