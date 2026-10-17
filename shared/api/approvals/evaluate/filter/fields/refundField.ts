import { nullableObjectField } from "./nullableObjectField";
import { numberField } from "./numberField";

type Refund = { amount: number };

export const refundField = <Parent>({
	labels,
	read,
}: {
	labels: { refund: string; "refund.amount": string };
	read: (parent: Parent) => Refund | null;
}) =>
	nullableObjectField<Parent, Refund>({
		label: labels.refund,
		read,
		fields: {
			amount: numberField({
				label: labels["refund.amount"],
				read: (refund) => refund.amount,
			}),
		},
		describeValue: (refund) => String(refund.amount),
	});
