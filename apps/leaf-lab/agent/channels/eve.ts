import { localDev } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";

export default eveChannel({ auth: [localDev()] });
