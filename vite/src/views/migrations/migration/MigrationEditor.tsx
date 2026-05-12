import type { Migration, MigrationFilter, Operations } from "@autumn/shared";
import {
	ArrowLeftIcon,
	ArrowRightIcon,
	CaretRightIcon,
	FunnelSimpleIcon,
	GearIcon,
} from "@phosphor-icons/react";
import { useStore } from "@tanstack/react-form";
import { useState } from "react";
import { Button } from "@/components/v2/buttons/Button";
import { cn } from "@/lib/utils";
import { CustomerPreview, useCustomerCount } from "./filters/CustomerPreview";
import { FilterForm } from "./filters/FilterForm";
import { MigrationLiveView } from "./live/MigrationLiveView";
import { OperationsForm } from "./operations/OperationsForm";
import { useMigrationEditorForm } from "./useMigrationEditorForm";

type Step = 1 | 2 | 3;

const STEPS = [
	{ step: 1 as const, label: "Filter" },
	{ step: 2 as const, label: "Operations" },
	{ step: 3 as const, label: "Live" },
];

export function MigrationEditor({ migration }: { migration: Migration }) {
	const [step, setStep] = useState<Step>(1);
	const { form } = useMigrationEditorForm({ migration });
	const filter = useStore(form.store, (s) => s.values.filter);
	const operations = useStore(form.store, (s) => s.values.operations);
	const customerCount = useCustomerCount(filter.customer ?? {});
	const hasCustomers = customerCount !== null && customerCount > 0;

	return (
		<div className="flex flex-col gap-6">
			<StepIndicator step={step} onStepChange={setStep} />

			{step === 1 && (
				<FilterStep
					form={form}
					filter={filter}
					customerCount={customerCount}
					hasCustomers={hasCustomers}
					onNext={() => setStep(2)}
				/>
			)}
			{step === 2 && (
				<OperationsStep
					form={form}
					operations={operations}
					onPrevious={() => setStep(1)}
					onNext={() => setStep(3)}
				/>
			)}
			{step === 3 && (
				<MigrationLiveView
					migrationId={migration.id}
					filter={filter}
					onPrevious={() => setStep(2)}
				/>
			)}
		</div>
	);
}

function StepIndicator({
	step,
	onStepChange,
}: {
	step: Step;
	onStepChange: (step: Step) => void;
}) {
	return (
		<div className="flex items-center gap-2">
			{STEPS.map((s, i) => (
				<div key={s.step} className="flex items-center gap-2">
					{i > 0 && <CaretRightIcon size={12} className="text-t4" />}
					<button
						type="button"
						onClick={() => onStepChange(s.step)}
						className={cn(
							"flex items-center gap-2 text-sm cursor-pointer",
							step === s.step ? "text-t1 font-medium" : "text-t3 hover:text-t2",
						)}
					>
						<span
							className={cn(
								"w-5 h-5 rounded-md flex items-center justify-center text-xs font-semibold",
								step === s.step
									? "bg-violet-600 text-white"
									: "bg-muted text-t3",
							)}
						>
							{s.step}
						</span>
						{s.label}
					</button>
				</div>
			))}
		</div>
	);
}

function FilterStep({
	form,
	filter,
	customerCount,
	hasCustomers,
	onNext,
}: {
	form: FormInstance;
	filter: MigrationFilter;
	customerCount: number | null;
	hasCustomers: boolean;
	onNext: () => void;
}) {
	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<div className="text-t2 text-md flex gap-2 items-center">
					<FunnelSimpleIcon size={16} weight="fill" className="text-subtle" />
					Filter
				</div>
				<Button
					variant="primary"
					size="default"
					onClick={onNext}
					disabled={!hasCustomers}
				>
					{hasCustomers ? `Next (${customerCount})` : "Next"}
					<ArrowRightIcon size={14} />
				</Button>
			</div>
			<FilterForm
				value={filter}
				onChange={(v) => form.setFieldValue("filter", v)}
			/>
			<CustomerPreview filter={filter.customer ?? {}} />
		</div>
	);
}

function OperationsStep({
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

type FormInstance = ReturnType<typeof useMigrationEditorForm>["form"];
