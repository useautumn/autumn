import { useState } from "react";
import { StepHeader } from "./StepHeader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIntegrateContext } from "./IntegrateContext";

export const SelectStack = () => {
  const { queryStates, setQueryStates } = useIntegrateContext();

  const frontendOptions = [
    { value: "nextjs", label: "Next.js" },
    { value: "vite", label: "Vite SPA" },
    { value: "tanstack", label: "Tanstack Start" },
    { value: "non-react", label: "Non-React" },
  ];

  const backendOptions = [
    { value: "nextjs", label: "Next.js" },
    { value: "react_router", label: "React Router 7" },
    { value: "hono", label: "Hono" },
    { value: "express", label: "Express" },
    { value: "elysia", label: "Elysia" },
    { value: "supabase", label: "Supabase" },
    { value: "convex", label: "Convex" },
  ];

  const authOptions = [
    { value: "better_auth", label: "Better Auth" },
    { value: "supabase", label: "Supabase Auth" },
    { value: "clerk", label: "Clerk" },
    { value: "other", label: "Other" },
  ];

  const customerOptions = [
    { value: "user", label: "Users" },
    { value: "org", label: "Organizations" },
    // { value: "other", label: "Other (eg. Projects / Workspaces)" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <StepHeader number={2} title="Select your stack" />
      <p className="text-sm text-t3">
        Help us customize the integration guide for your specific tech stack.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-[600px]">
        {/* Frontend Framework */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-t2">Frontend</label>
          <Select
            value={queryStates.frontend}
            onValueChange={(value) =>
              setQueryStates({ ...queryStates, frontend: value })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select framework" />
            </SelectTrigger>
            <SelectContent>
              {frontendOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Backend Framework */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-t2">Backend</label>
          <Select
            value={queryStates.backend}
            onValueChange={(value) =>
              setQueryStates({ ...queryStates, backend: value })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select backend" />
            </SelectTrigger>
            <SelectContent>
              {backendOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Auth Provider */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-t2">Auth Provider</label>
          <Select
            value={queryStates.auth}
            onValueChange={(value) =>
              setQueryStates({ ...queryStates, auth: value })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select auth provider" />
            </SelectTrigger>
            <SelectContent>
              {authOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Customer Type */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-t2">
            Your customers are
          </label>
          <Select
            value={queryStates.customerType}
            onValueChange={(value) =>
              setQueryStates({ ...queryStates, customerType: value })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select customer type" />
            </SelectTrigger>
            <SelectContent>
              {customerOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* {(stack.frontend ||
        stack.backend ||
        stack.auth ||
        stack.customerType) && (
        <div className="mt-4 p-3 bg-zinc-50 dark:bg-zinc-900 rounded-md border border-zinc-200 dark:border-zinc-800">
          <h4 className="text-sm font-medium text-t2 mb-2">Selected Stack:</h4>
          <div className="text-xs text-t3 space-y-1">
            {stack.frontend && (
              <p>
                <strong>Frontend:</strong>{" "}
                {frontendOptions.find((f) => f.value === stack.frontend)?.label}
              </p>
            )}
            {stack.backend && (
              <p>
                <strong>Backend:</strong>{" "}
                {backendOptions.find((b) => b.value === stack.backend)?.label}
              </p>
            )}
            {stack.auth && (
              <p>
                <strong>Auth:</strong>{" "}
                {authOptions.find((a) => a.value === stack.auth)?.label}
              </p>
            )}
            {stack.customerType && (
              <p>
                <strong>Customers:</strong>{" "}
                {
                  customerOptions.find((c) => c.value === stack.customerType)
                    ?.label
                }
              </p>
            )}
          </div>
        </div>
      )} */}
    </div>
  );
};
