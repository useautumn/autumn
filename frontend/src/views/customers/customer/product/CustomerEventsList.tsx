import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import CopyButton from "@/components/general/CopyButton";

export const CustomerEventsList = ({ events }: { events: any }) => {
  return (
    <div className="flex flex-col gap-1">
      <Table className="p-2">
        <TableHeader className="bg-transparent">
          <TableRow>
            <TableHead>Event Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Event ID</TableHead>
            <TableHead className="min-w-0 w-24">Timestamp</TableHead>
            <TableHead className="min-w-0 w-6"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event: any) => {
            return (
              <TableRow key={event.id} className="group">
                <TableCell className="font-mono">{event.event_name}</TableCell>
                <TableCell className="font-mono">
                  <span className="text-t3">POST </span>
                  <span className="text-lime-600">200</span>
                </TableCell>
                <TableCell className="relative text-t3">
                  {event.id}
                  <div className="absolute hidden group-hover:block top-1/2 -translate-y-1/2 right-0 rounded-sm h-5 w-5">
                    <CopyButton
                      text={event.id}
                      className="bg-white h-full w-full"
                    />
                  </div>
                </TableCell>
                <TableCell className="">
                  <span className="">
                    {formatUnixToDateTime(event.timestamp).date}
                  </span>
                  <span className="text-t3">
                    {" "}
                    {formatUnixToDateTime(event.timestamp).time}{" "}
                  </span>
                </TableCell>
                <TableCell className=""></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <p className="text-t3 text-xs w-full text-center">
        Showing last 10 events
      </p>
    </div>
  );
};
