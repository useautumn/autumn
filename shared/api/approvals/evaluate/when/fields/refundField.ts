import { nullableObjectField } from "./nullableObjectField";
import { numberField } from "./numberField";

export const refundField = <Parent>({
	read,
}: {
	read: (parent: Parent) => { amount: number } | null;
}) =>
	nullableObjectField<Parent, { amount: number }>({
		label: "Refund",
		read,
		fields: {
			amount: numberField({ label: "Refund", read: (refund) => refund.amount }),
		},
		describeValue: (refund) => String(refund.amount),
	});
