import { useForm } from "@tanstack/react-form";
import { numberOrUndefined } from "../format";
import type { AtomRunner } from "../hooks/useAtomRunner";
import { FormRow } from "./FormRow";
import { NumberField } from "./NumberField";
import { OptionToggle } from "./OptionToggle";
import { SubmitButton } from "./SubmitButton";

const OVERAGE = ["cap", "overflow"] as const;

export const TrackForm = ({ runner }: { runner: AtomRunner }) => {
  const form = useForm({
    defaultValues: { value: "1", overage: "cap" as (typeof OVERAGE)[number] },
    onSubmit: async ({ value }) => {
      await runner.run({
        label: `Track ${value.value}`,
        call: {
          action: "track",
          params: {
            ...runner.base,
            value: numberOrUndefined(value.value),
            overageBehavior: value.overage,
            async: false,
          },
        },
      });
    },
  });

  return (
    <FormRow onSubmit={form.handleSubmit}>
      <form.Field name="value">
        {(field) => (
          <NumberField label="Value" value={field.state.value} onChange={field.handleChange} />
        )}
      </form.Field>
      <form.Field name="overage">
        {(field) => (
          <OptionToggle value={field.state.value} options={OVERAGE} onChange={field.handleChange} />
        )}
      </form.Field>
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => <SubmitButton isSubmitting={isSubmitting}>Track</SubmitButton>}
      </form.Subscribe>
    </FormRow>
  );
};
