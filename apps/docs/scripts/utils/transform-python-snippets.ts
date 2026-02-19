/**
 * Transform Python code snippets from synchronous to async/await pattern
 */
export function transformPythonSnippets({ spec }: { spec: any }) {
  // Recursively traverse the spec to find x-codeSamples
  function traverse(obj: any) {
    if (obj && typeof obj === 'object') {
      // Check if this object has x-codeSamples
      if (obj['x-codeSamples'] && Array.isArray(obj['x-codeSamples'])) {
        for (const sample of obj['x-codeSamples']) {
          if (sample.lang === 'Python' && sample.source) {
            sample.source = transformPythonCode(sample.source);
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

function transformPythonCode(code: string): string {
  // Step 1: Add asyncio import if not present
  if (!code.includes('import asyncio')) {
    code = 'import asyncio\n' + code;
  }

  // Step 2: Replace client initialization
  // Match: client = Autumn(\n    secret_key="My Secret Key",\n)
  code = code.replace(
    /client = Autumn\(\s*\n\s*secret_key=["'][^"']*["'],?\s*\n\)/g,
    'autumn = Autumn("am_sk_1234567890")'
  );

  // Step 3: Replace "client." with "autumn." throughout
  code = code.replace(/\bclient\./g, 'autumn.');

  // Step 4: Find the line after autumn initialization and insert async def main():
  const lines = code.split('\n');
  const autumnInitIndex = lines.findIndex(line => line.includes('autumn = Autumn('));

  if (autumnInitIndex === -1) {
    return code; // Can't find initialization, return as-is
  }

  // Split into before (imports + init) and after (the actual code)
  const beforeLines = lines.slice(0, autumnInitIndex + 1);
  const afterLines = lines.slice(autumnInitIndex + 1).filter(line => line.trim() !== '');

  // Step 5: Add await to autumn method calls and indent
  const transformedAfterLines = afterLines.map(line => {
    const trimmed = line.trim();
    if (trimmed === '') return line;

    // Add await before autumn calls if not already present
    // Pattern: variable = autumn.method() -> variable = await autumn.method()
    let transformed = line;
    if (trimmed.includes('autumn.') && !trimmed.includes('await')) {
      // Match assignment pattern: var = autumn.method()
      transformed = line.replace(/^(\s*)(\w+\s*=\s*)(autumn\.)/g, '$1$2await $3');
    }

    // Add 4 spaces of indentation to all lines (preserving relative indentation)
    transformed = '    ' + transformed;

    return transformed;
  });

  // Step 6: Reconstruct the code
  const result = [
    ...beforeLines,
    '',
    'async def main():',
    ...transformedAfterLines,
    '',
    'asyncio.run(main())'
  ].join('\n');

  return result;
}
