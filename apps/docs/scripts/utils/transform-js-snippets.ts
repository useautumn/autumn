export function transformJsSnippets({ spec }: { spec: any }) {
  function traverse(obj: any) {
    if (obj && typeof obj === 'object') {
      if (obj['x-codeSamples'] && Array.isArray(obj['x-codeSamples'])) {
        for (const sample of obj['x-codeSamples']) {
          if (sample.lang === 'TypeScript' && sample.source) {
            sample.source = transformJsCode(sample.source);
          }
        }
      }

      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          traverse(obj[key]);
        }
      }
    }
  }

  traverse(spec);
  return spec;
}

function transformJsCode(code: string): string {
  code = code.replace(
    /import\s+Autumn\s+from\s+['"]@useautumn\/sdk['"]/g,
    "import { Autumn } from 'autumn-js'"
  );

  code = code.replace(
    /const\s+client\s*=\s*new\s+Autumn\(\s*\{[^}]*\}\s*\)/g,
    'const autumn = new Autumn()'
  );

  code = code.replace(/\bclient\./g, 'autumn.');

  return code;
}
