import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { useProductsContext } from "../ProductsContext";

export const CouponsTable = () => {
  const { coupons } = useProductsContext();
  // const [selectedCreditSystem, setSelectedCreditSystem] =
  //   useState<Feature | null>(null);
  // const [open, setOpen] = useState(false);

  // const handleRowClick = (id: string) => {
  //   const creditSystem = creditSystems.find(
  //     (creditSystem: Feature) => creditSystem.id === id
  //   );
  //   console.log(creditSystem);
  //   if (!creditSystem) return;

  //   setSelectedCreditSystem(creditSystem);
  //   setOpen(true);
  // };

  return (
    <>
      {/* <UpdateCreditSystem
          open={open}
          setOpen={setOpen}
          selectedCreditSystem={selectedCreditSystem!}
          setSelectedCreditSystem={setSelectedCreditSystem}
        /> */}
      <Table>
        <TableHeader className="rounded-full">
          <TableRow>
            <TableHead className="">Credits Name</TableHead>
            <TableHead>Credits ID</TableHead>
            <TableHead>Features</TableHead>
            <TableHead className="min-w-0 w-28">Created At</TableHead>
            <TableHead className="min-w-0 w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {creditSystems.map((creditSystem) => (
            <TableRow
              key={creditSystem.id}
              className="cursor-pointer"
              onClick={() => handleRowClick(creditSystem.id)}
            >
              <TableCell className="font-medium">{creditSystem.name}</TableCell>
              <TableCell className="font-mono text-t2">
                {" "}
                {creditSystem.id}{" "}
              </TableCell>
              <TableCell className="font-mono text-t2 w-full">
                {creditSystem.config.schema
                  .map((schema: any) => schema.metered_feature_id)
                  .join(", ")}{" "}
              </TableCell>
              <TableCell className="">
                {formatUnixToDateTime(creditSystem.created_at).date}
                <span className="text-t3">
                  {" "}
                  {formatUnixToDateTime(creditSystem.created_at).time}{" "}
                </span>
              </TableCell>
              <TableCell className="">
                <CreditSystemRowToolbar creditSystem={creditSystem} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
};
