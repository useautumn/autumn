export function replaceJavascriptWithTypescript({ spec }: { spec: any }) {
  const jsonString = JSON.stringify(spec);
  const replaced = jsonString
    .replace(/Javascript/g, 'Typescript')
    .replace(/javascript/g, 'typescript')
    .replace(/JavaScript/g, 'TypeScript');

  return JSON.parse(replaced);
}
