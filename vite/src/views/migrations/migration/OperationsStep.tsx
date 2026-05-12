import type { Operations } from "@autumn/shared";
import { ArrowLeftIcon, ArrowRightIcon, GearIcon } from "@phosphor-icons/react";
import { Button } from "@/components/v2/buttons/Button";
import { OperationsForm } from "./operations/OperationsForm";
import type { useMigrationEditorForm } from "./useMigrationEditorForm";

type FormInstance = ReturnType<typeof useMigrationEditorForm>["form"];

export function OperationsStep({
	form,
	operations,
	onPrevious,
	onNext,
}: {
	form: FormInstance;
	operations: Operations;
	onPrevious: () => void;
	onNext: () => void;
}) {
	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center justify-between">
				<div className="text-t2 text-md flex gap-2 items-center">
					<GearIcon size={16} weight="fill" className="text-subtle" />
					Operations
				</div>
				<div className="flex items-center gap-2">
					<Button variant="secondary" size="default" onClick={onPrevious}>
						<ArrowLeftIcon size={14} />
						Previous
					</Button>
					<Button variant="primary" size="default" onClick={onNext}>
						Next
						<ArrowRightIcon size={14} />
					</Button>
				</div>
			</div>
			<OperationsForm
				value={operations}
				onChange={(v) => form.setFieldValue("operations", v)}
			/>
		</div>
	);
}
