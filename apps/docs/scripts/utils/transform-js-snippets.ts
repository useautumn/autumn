/**
 * Transform JavaScript/TypeScript code snippets
 */
export function transformJsSnippets({ spec }: { spec: any }) {
  // Recursively traverse the spec to find x-codeSamples
  function traverse(obj: any) {
    if (obj && typeof obj === 'object') {
      // Check if this object has x-codeSamples
      if (obj['x-codeSamples'] && Array.isArray(obj['x-codeSamples'])) {
        for (const sample of obj['x-codeSamples']) {
          if (sample.lang === 'TypeScript' && sample.source) {
            sample.source = transformJsCode(sample.source);
          }
        }
      }

      // Recurse into all properties
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
  // Step 1: Replace import statement
  code = code.replace(
    /import\s+Autumn\s+from\s+['"]@useautumn\/sdk['"]/g,
    "import { Autumn } from 'autumn-js'"
  );

  // Step 2: Replace client initialization - remove the constructor argument
  code = code.replace(
    /const\s+client\s*=\s*new\s+Autumn\(\s*\{[^}]*\}\s*\)/g,
    'const autumn = new Autumn()'
  );

  // Step 3: Replace "client." with "autumn." throughout
  code = code.replace(/\bclient\./g, 'autumn.');

  return code;
}
