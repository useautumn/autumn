import { useForm } from "@tanstack/react-form";
import { newLockId, responseBodyOf } from "@/lib/atom/callAtom";
import { numberOrUndefined } from "../format";
import type { AtomRunner } from "../hooks/useAtomRunner";
import type { HeldLock } from "../types";
import { FormRow } from "./FormRow";
import { NumberField } from "./NumberField";
import { OptionToggle } from "./OptionToggle";
import { SubmitButton } from "./SubmitButton";

const OVERAGE = ["reject", "cap", "overflow"] as const;

export const LockForm = ({
  runner,
  onLocked,
}: {
  runner: AtomRunner;
  onLocked: (lock: HeldLock) => void;
}) => {
  const form = useForm({
    defaultValues: {
      amount: "1",
      expiresIn: "",
      overage: "reject" as (typeof OVERAGE)[number],
    },
    onSubmit: async ({ value }) => {
      const lockId = newLockId();
      const amount = numberOrUndefined(value.amount);
      const seconds = numberOrUndefined(value.expiresIn);
      const expiresAt = seconds ? Date.now() + seconds * 1000 : undefined;
      const result = await runner.run({
        label: `Lock ${value.amount}`,
        call: {
          action: "check",
          params: {
            ...runner.base,
            requiredBalance: amount,
            lock: {
              lockId,
              enabled: true,
              expiresAt,
              overageBehavior: value.overage === "reject" ? undefined : value.overage,
            },
          },
        },
      });
      if (responseBodyOf({ result })?.allowed === true) {
        onLocked({ lockId, amount, expiresAt, status: "held" });
      }
    },
  });

  return (
    <FormRow onSubmit={form.handleSubmit}>
      <form.Field name="amount">
        {(field) => (
          <NumberField label="Amount" value={field.state.value} onChange={field.handleChange} />
        )}
      </form.Field>
      <form.Field name="expiresIn">
        {(field) => (
          <NumberField
            label="Expiry (s)"
            placeholder="—"
            value={field.state.value}
            onChange={field.handleChange}
          />
        )}
      </form.Field>
      <form.Field name="overage">
        {(field) => (
          <OptionToggle value={field.state.value} options={OVERAGE} onChange={field.handleChange} />
        )}
      </form.Field>
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => <SubmitButton isSubmitting={isSubmitting}>Lock</SubmitButton>}
      </form.Subscribe>
    </FormRow>
  );
};
