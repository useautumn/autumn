import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from "@/components/ui/table";
  import { formatUnixToDateTime, } from "@/utils/formatUtils/formatDateUtils";

  
  export const CustomerEventsList = ({
    events
  }: {
    events: any;
  }) => {

    console.log("events", events);
    return (
      <div className="flex flex-col gap-1">
        <Table className="p-2">
          <TableHeader className="bg-transparent">
            <TableRow className="">
              <TableHead className="w-[150px]">Event Name</TableHead>
              <TableHead className="">Status</TableHead>
              <TableHead className="">Event ID</TableHead>
              <TableHead className="">Event Timestamp</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="font-mono">
            {events.map((event: any) => {
              return (
                <TableRow
                  key={event.id}
                >
                  <TableCell>
                    {event.event_name}
                  </TableCell>
                  <TableCell>
                    <span className="text-t3">POST </span>
                    <span className="text-lime-600">200</span>
                  </TableCell>
                  <TableCell className="max-w-[100px] overflow-hidden text-ellipsis">
                    {event.id}
                  </TableCell>
                  <TableCell>
                    <span className="text-t3">{formatUnixToDateTime(event.timestamp).date}</span>
                    <span className="">
                      {" "}
                      {formatUnixToDateTime(event.timestamp).time}{" "}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <p className="text-t3 text-xs w-full text-center">Showing last 10 events</p>
      </div>
    );
  };
  