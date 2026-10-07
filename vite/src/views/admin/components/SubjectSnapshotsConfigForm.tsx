import { Button, DialogFooter } from "@autumn/ui";
import { useStore } from "@tanstack/react-form";
import { SubjectSnapshotsModePicker } from "./SubjectSnapshotsModePicker";
import { SubjectSnapshotsReview } from "./SubjectSnapshotsReview";
import { SubjectSnapshotsSourceStatus } from "./SubjectSnapshotsSourceStatus";
import {
	SUBJECT_SNAPSHOT_DEFAULTS,
	SUBJECT_SNAPSHOT_LIMITS,
	type SubjectSnapshotsConfigResponse,
} from "./subjectSnapshotsConfig";
import { useSubjectSnapshotsForm } from "./useSubjectSnapshotsForm";

export function SubjectSnapshotsConfigForm({
	config,
	onClose,
}: {
	config: SubjectSnapshotsConfigResponse;
	onClose: () => void;
}) {
	const {
		form,
		pending,
		changes,
		stampsWrittenAfter,
		isSaving,
		review,
		backToEdit,
		save,
	} = useSubjectSnapshotsForm({ config, onClose });
	const isDirty = useStore(form.store, (state) => state.isDirty);

	if (pending) {
		const servesSnapshots = pending.mode === "serve";
		return (
			<>
				<SubjectSnapshotsReview
					changes={changes}
					servesSnapshots={servesSnapshots}
					stampsWrittenAfter={stampsWrittenAfter}
				/>
				<DialogFooter>
					<Button variant="secondary" onClick={backToEdit} disabled={isSaving}>
						Back
					</Button>
					<Button
						onClick={save}
						disabled={changes.length === 0}
						isLoading={isSaving}
					>
						{servesSnapshots ? "Save and serve" : "Save"}
					</Button>
				</DialogFooter>
			</>
		);
	}

	return (
		<>
			<div className="flex flex-col gap-6">
				<form.Field name="mode">
					{(field) => (
						<SubjectSnapshotsModePicker
							value={field.state.value}
							onChange={field.handleChange}
						/>
					)}
				</form.Field>

				<div className="grid gap-4 sm:grid-cols-2">
					{SUBJECT_SNAPSHOT_LIMITS.map((limit) => (
						<form.AppField key={limit.name} name={limit.name}>
							{(field) => (
								<field.NumberField
									label={limit.label}
									description={`${limit.description} Default ${SUBJECT_SNAPSHOT_DEFAULTS[limit.name].toLocaleString()}.`}
									placeholder={String(SUBJECT_SNAPSHOT_DEFAULTS[limit.name])}
									min={1}
									max={limit.max}
									inputClassName="tabular-nums"
								/>
							)}
						</form.AppField>
					))}
				</div>

				<SubjectSnapshotsSourceStatus config={config} />
			</div>
			<DialogFooter>
				<Button variant="secondary" onClick={onClose}>
					Cancel
				</Button>
				<Button onClick={review} disabled={!isDirty}>
					Review changes
				</Button>
			</DialogFooter>
		</>
	);
}
