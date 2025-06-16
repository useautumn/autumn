import { ColumnDef, Row } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import CopyButton from "@/components/general/CopyButton";
import { format } from "date-fns";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";

export type User = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  lastSignedIn: string;
};

// Helper to add width and canCopy to columns
interface ExtraColumnOptions {
  width?: string | number;
  canCopy?: boolean;
}

type UserColumnDef = ColumnDef<User> & ExtraColumnOptions;

export const columns: UserColumnDef[] = [
  {
    accessorKey: "id",
    header: "ID",
    width: 60,
    canCopy: true,
    cell: ({ row }: { row: Row<User> }) => {
      const value = row.getValue("id") as string;
      return (
        <div>
          <CopyButton className="text-xs" text={value}></CopyButton>
        </div>
      );
    },
  },
  {
    accessorKey: "name",
    header: "Name",
    width: 150,
    cell: ({ row }: { row: Row<User> }) => {
      const value = row.getValue("name") as string;
      return <div>{value}</div>;
    },
  },
  {
    accessorKey: "email",
    header: "Email",
    canCopy: true,
    width: 200,
    cell: ({ row }: { row: Row<User> }) => {
      const value = row.getValue("email") as string;
      return (
        <CopyButton className="max-w-40 text-xs overflow-hidden" text={value}>
          {value}
        </CopyButton>
      );
    },
  },
  {
    accessorKey: "createdAt",
    header: "Created At",
    width: 150,
    cell: ({ row }: { row: Row<User> }) => {
      const value = row.getValue("createdAt");
      return (
        <span className="w-30">
          {format(new Date(value as string), "dd MMM hh:mm")}
        </span>
      );
    },
  },

  {
    id: "impersonate",
    header: "Impersonate",
    width: "100%",
    cell: ({ row }: { row: Row<User> }) => (
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          const res = await authClient.admin.impersonateUser({
            userId: row.original.id,
          });

          if (res.error) {
            toast.error("Something went wrong");
            return;
          }

          window.location.reload();
        }}
        style={{ width: 100 }}
      >
        Impersonate
      </Button>
    ),
    enableSorting: false,
    enableHiding: false,
  },
];
