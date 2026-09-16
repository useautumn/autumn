import { FormLabel } from "@autumn/ui";
import { CreditSchemaListProvider } from "../hooks/CreditSchemaListContext";
import { useCreditSchema } from "../hooks/useCreditSchema";
import type { CreditSystemFormInstance } from "../hooks/useCreditSystemForm";
import { CreditRateCardList } from "./CreditRateCardList";

interface ClassicCreditSchemaProps {
	form: CreditSystemFormInstance;
}

export function ClassicCreditSchema({ form }: ClassicCreditSchemaProps) {
	const { schema, setSchema } = useCreditSchema(form);

	return (
		<CreditSchemaListProvider schema={schema} onChange={setSchema}>
			<div className="flex flex-col gap-4">
				<div className="flex flex-col gap-1">
					<FormLabel>Rate card</FormLabel>
					<CreditRateCardList />
				</div>
			</div>
		</CreditSchemaListProvider>
	);
}
