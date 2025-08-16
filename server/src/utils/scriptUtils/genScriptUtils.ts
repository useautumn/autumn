import csv from "csv-parser";
import fs from "fs";

export const parseCsv = ({
  path,
  delimiter = ",",
}: {
  path: string;
  delimiter?: string;
}) => {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(path);
    const results: any[] = [];
    let headers: string[] = [];
    stream
      .pipe(csv({ separator: delimiter }))
      .on("data", (data) => {
        results.push(data);
        // if (headers.length === 0) {
        //   headers = Object.keys(data);
        // } else {
        //   results.push(data);
        // }
      })
      .on("end", () => resolve(results))
      .on("error", (error) => reject(error));
  }) as Promise<any[]>;
};
