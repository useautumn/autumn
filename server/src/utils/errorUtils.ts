import { ZodError } from "zod";

export default class RecaseError extends Error {
  code: string;
  data: any;
  statusCode: number;

  constructor({
    message,
    code,
    data,
    statusCode = 500,
  }: {
    message: string;
    code: string;
    data?: any;
    statusCode?: number;
  }) {
    super(message);
    this.name = "RecaseError";
    this.code = code;
    this.data = data;
    this.statusCode = statusCode;
  }

  print() {
    console.log(`RECASE ERROR\n${this.code}: ${this.message}\n`);
    console.log(this.data);
  }
}

export function formatZodError(error: ZodError): string {
  return error.errors
    .map((err) => `${err.path.join(".")}: ${err.message}`)
    .join(", ");
}

export const handleRequestError = ({
  error,
  res,
  action,
}: {
  error: any;
  res: any;
  action: string;
}) => {
  if (error instanceof RecaseError) {
    error.print();
    res.status(error.statusCode).json({
      message: error.message,
      code: error.code,
    });
  } else {
    console.log(`Unknown error | ${action}`, error);
    res.status(500).json({ message: "Internal server error" });
  }
};
