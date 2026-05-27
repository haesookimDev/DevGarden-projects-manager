// Bootstrap message the sidecar reads from stdin once at startup. The Rust
// host writes one JSON line + newline; everything after that is reserved
// for future IPC (host → sidecar commands; currently unused).
//
// Shape kept narrow on purpose — anything else the sidecar needs about the
// pairing lives behind the JWT the api decodes.

export interface BootstrapMessage {
  apiBaseUrl: string;
  jwt: string;
}

export class BootstrapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BootstrapError';
  }
}

/** Parse one line of stdin into a {apiBaseUrl, jwt}. Strict — both fields
 *  must be non-empty strings and apiBaseUrl must include an http(s) scheme. */
export function parseBootstrap(raw: string): BootstrapMessage {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new BootstrapError('bootstrap line is not valid JSON');
  }
  if (typeof json !== 'object' || json === null) {
    throw new BootstrapError('bootstrap line must be a JSON object');
  }
  const obj = json as Record<string, unknown>;
  const apiBaseUrl = obj.apiBaseUrl;
  const jwt = obj.jwt;
  if (typeof apiBaseUrl !== 'string' || apiBaseUrl.length === 0) {
    throw new BootstrapError('bootstrap.apiBaseUrl must be a non-empty string');
  }
  if (!/^https?:\/\//i.test(apiBaseUrl)) {
    throw new BootstrapError('bootstrap.apiBaseUrl must include an http(s):// scheme');
  }
  if (typeof jwt !== 'string' || jwt.length === 0) {
    throw new BootstrapError('bootstrap.jwt must be a non-empty string');
  }
  return { apiBaseUrl, jwt };
}

/** Read until the first non-empty line, then resolve. Async iterator-based
 *  so callers can pass any readline interface (real stdin or a fake one
 *  driven by a test). */
export async function readFirstLine(lines: AsyncIterable<string>): Promise<string> {
  for await (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) return trimmed;
  }
  throw new BootstrapError('stdin closed before a bootstrap line arrived');
}
