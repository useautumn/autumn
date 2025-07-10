import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useParams } from "react-router";

export const ViewUserEvents = ({ customer }: { customer: any }) => {
    const params = useParams();
    console.log(params, customer)

  return (
    <div>
      <Dialog>
        <DialogTrigger>
          <Button variant="analyse">Analyse Events</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you absolutely sure?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete your
              account and remove your data from our servers.

              {JSON.stringify(customer, null, 4)}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
};
