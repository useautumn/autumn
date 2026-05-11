import type { Migration, MigrationFilter, Operations } from "@autumn/shared";
import {
	ArrowRightIcon,
	CaretRightIcon,
	CodeIcon,
	EyeIcon,
	PlayIcon,
	SlidersIcon,
	WarningIcon,
} from "@phosphor-icons/react";
import { useStore } from "@tanstack/react-form";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/v2/buttons/Button";
import { ShortcutButton } from "@/components/v2/buttons/ShortcutButton";
import { useTheme } from "@/contexts/ThemeProvider";
import { AUTUMN_DARK, AUTUMN_LIGHT } from "@/lib/monacoThemes";
import { cn } from "@/lib/utils";
import { CustomerPreview, useCustomerCount } from "./filters/CustomerPreview";
import { FilterForm } from "./filters/FilterForm";
import { RawField } from "./MigrationRawEditor";
import { OperationsForm } from "./operations/OperationsForm";
import { MigrationRunsView } from "./runs/MigrationRunsView";
import { useMigrationEditorForm } from "./useMigrationEditorForm";

type EditorMode = "form" | "json";
type Step = 1 | 2 | 3;

const CONFIRM_TIMEOUT_MS = 3000;

const STEPS = [
	{ step: 1 as const, label: "Filter" },
	{ step: 2 as const, label: "Operations" },
	{ step: 3 as const, label: "Results" },
];

function useConfirmAction(action: () => void) {
	const [isConfirming, setIsConfirming] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout>>();

	const trigger = useCallback(() => {
		if (!isConfirming) {
			setIsConfirming(true);
			timerRef.current = setTimeout(
				() => setIsConfirming(false),
				CONFIRM_TIMEOUT_MS,
			);
			return;
		}
		clearTimeout(timerRef.current);
		setIsConfirming(false);
		action();
	}, [isConfirming, action]);

	const cancel = useCallback(() => {
		clearTimeout(timerRef.current);
		setIsConfirming(false);
	}, []);

	return { isConfirming, trigger, cancel };
}

export function MigrationEditor({
	migration,
}: {
	migration: Migration;
}) {
	const [step, setStep] = useState<Step>(1);

	const { form, handleDryRun, handleRealRun, isUpdating, isRunning } =
		useMigrationEditorForm({
			migration,
			onRunTriggered: () => setStep(3),
		});

	const [mode, setMode] = useState<EditorMode>("form");
	const canSubmit = useStore(form.store, (s) => s.canSubmit);
	const filter = useStore(form.store, (s) => s.values.filter);
	const customerCount = useCustomerCount(filter.customer ?? {});
	const hasCustomers = customerCount !== null && customerCount > 0;
	const confirm = useConfirmAction(handleRealRun);

	const toggleMode = useCallback(
		() => setMode((m) => (m === "form" ? "json" : "form")),
		[],
	);

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-center justify-between">
				<StepIndicator step={step} onStepChange={setStep} />
				<div className={cn("flex items-center gap-2", step === 3 && "invisible")}>
					<ShortcutButton
						variant="secondary"
						size="default"
						onClick={() => form.handleSubmit()}
						metaShortcut="s"
						isLoading={isUpdating}
						disabled={!canSubmit}
					>
						Save
					</ShortcutButton>
					{step === 1 && (
						<Button
							variant="primary"
							size="default"
							onClick={() => setStep(2)}
							disabled={!hasCustomers}
						>
							{hasCustomers ? `Next (${customerCount})` : "Next"}
							<ArrowRightIcon size={14} />
						</Button>
					)}
					{step === 2 && (
						<>
							<Button
								variant="secondary"
								size="default"
								onClick={handleDryRun}
								isLoading={isRunning}
							>
								<EyeIcon size={14} />
								Dry Run
							</Button>
							<Button
								variant={confirm.isConfirming ? "destructive" : "primary"}
								size="default"
								onClick={confirm.trigger}
								onBlur={confirm.cancel}
								isLoading={isRunning}
							>
								{confirm.isConfirming ? (
									<WarningIcon size={14} weight="fill" />
								) : (
									<PlayIcon size={14} weight="fill" />
								)}
								{confirm.isConfirming ? "Confirm Run" : "Run"}
							</Button>
						</>
					)}
				</div>
			</div>

			{step === 1 && (
				<FilterStep
					form={form}
					mode={mode}
					onToggleMode={toggleMode}
				/>
			)}
			{step === 2 && (
				<OperationsStep
					form={form}
					mode={mode}
					onToggleMode={toggleMode}
				/>
			)}
			{step === 3 && (
				<MigrationRunsView migrationId={migration.id} />
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
							step === s.step
								? "text-t1 font-medium"
								: "text-t3 hover:text-t2",
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
	mode,
	onToggleMode,
}: {
	form: FormInstance;
	mode: EditorMode;
	onToggleMode: () => void;
}) {
	const { isDark } = useTheme();
	const theme = isDark ? AUTUMN_DARK : AUTUMN_LIGHT;
	const filter = useStore(form.store, (s) => s.values.filter);

	return (
		<div className="flex flex-col gap-4">
			<FormSection
				title="Filter"
				description="Select which customers this migration applies to."
				mode={mode}
				onToggleMode={onToggleMode}
			>
				{mode === "form" ? (
					<FilterForm
						value={filter}
						onChange={(v) => form.setFieldValue("filter", v)}
					/>
				) : (
					<RawField
						value={filter}
						onChange={(v) =>
							form.setFieldValue("filter", v as MigrationFilter)
						}
						height="240px"
						theme={theme}
					/>
				)}
			</FormSection>

			<CustomerPreview filter={filter.customer ?? {}} />
		</div>
	);
}

function OperationsStep({
	form,
	mode,
	onToggleMode,
}: {
	form: FormInstance;
	mode: EditorMode;
	onToggleMode: () => void;
}) {
	const { isDark } = useTheme();
	const theme = isDark ? AUTUMN_DARK : AUTUMN_LIGHT;
	const operations = useStore(form.store, (s) => s.values.operations);

	return (
		<FormSection
			title="Operations"
			description="Define the mutations applied to each matched customer."
			mode={mode}
			onToggleMode={onToggleMode}
		>
			{mode === "form" ? (
				<OperationsForm
					value={operations}
					onChange={(v) => form.setFieldValue("operations", v)}
				/>
			) : (
				<RawField
					value={operations}
					onChange={(v) =>
						form.setFieldValue("operations", v as Operations)
					}
					height="360px"
					theme={theme}
				/>
			)}
		</FormSection>
	);
}

function FormSection({
	title,
	description,
	mode,
	onToggleMode,
	children,
}: {
	title: string;
	description: string;
	mode: EditorMode;
	onToggleMode: () => void;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-sm font-medium text-t1">{title}</h2>
					<p className="text-xs text-t3">{description}</p>
				</div>
				<Button variant="secondary" size="sm" onClick={onToggleMode}>
					{mode === "form" ? (
						<>
							<CodeIcon size={14} />
							Edit in JSON
						</>
					) : (
						<>
							<SlidersIcon size={14} />
							Edit in Builder
						</>
					)}
				</Button>
			</div>
			{children}
		</div>
	);
}

type FormInstance = ReturnType<typeof useMigrationEditorForm>["form"];
