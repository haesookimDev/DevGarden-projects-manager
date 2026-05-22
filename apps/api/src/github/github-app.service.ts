import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';

interface InstallationTokenEntry {
  token: string;
  expiresAt: number;
}

@Injectable()
export class GithubAppService {
  private readonly tokenCache = new Map<number, InstallationTokenEntry>();

  appId(): number {
    const v = process.env.GITHUB_APP_ID;
    if (!v) throw new InternalServerErrorException('GITHUB_APP_ID is not set');
    const n = Number(v);
    if (!Number.isFinite(n)) throw new InternalServerErrorException('GITHUB_APP_ID is not numeric');
    return n;
  }

  privateKey(): string {
    const raw = process.env.GITHUB_APP_PRIVATE_KEY;
    if (!raw) throw new InternalServerErrorException('GITHUB_APP_PRIVATE_KEY is not set');
    return normalizePrivateKey(raw);
  }

  appOctokit(): Octokit {
    return new Octokit({
      authStrategy: createAppAuth,
      auth: { appId: this.appId(), privateKey: this.privateKey() },
    });
  }

  async getInstallationToken(installationId: number, now = Date.now()): Promise<string> {
    const cached = this.tokenCache.get(installationId);
    // 60s safety margin before expiry
    if (cached && cached.expiresAt - 60_000 > now) {
      return cached.token;
    }

    const auth = createAppAuth({ appId: this.appId(), privateKey: this.privateKey() });
    const result = await auth({ type: 'installation', installationId });
    const expiresAt = new Date(result.expiresAt).getTime();

    this.tokenCache.set(installationId, { token: result.token, expiresAt });
    return result.token;
  }

  async installationOctokit(installationId: number): Promise<Octokit> {
    const token = await this.getInstallationToken(installationId);
    return new Octokit({ auth: token });
  }
}

const PEM_HEADER_RE = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;

/**
 * Accept three forms of GITHUB_APP_PRIVATE_KEY so .env stays ergonomic:
 *
 *   1. Multi-line PEM (compose can carry it through double quotes).
 *   2. Single-line PEM with literal `\n` between PEM lines.
 *   3. base64-encoded PEM (no escaping at all — the safest in .env).
 *
 * Also normalizes CRLF → LF; some editors save `.pem` files with Windows
 * endings, which `universal-github-app-jwt` rejects as "Invalid keyData".
 */
export function normalizePrivateKey(raw: string): string {
  let pem = raw.trim();

  if (!PEM_HEADER_RE.test(pem)) {
    // Doesn't look like a PEM yet — try base64 decode.
    try {
      const decoded = Buffer.from(pem, 'base64').toString('utf8');
      if (PEM_HEADER_RE.test(decoded)) pem = decoded;
    } catch {
      // fall through to header check below
    }
  }

  pem = pem.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');

  if (!PEM_HEADER_RE.test(pem)) {
    throw new InternalServerErrorException(
      'GITHUB_APP_PRIVATE_KEY is not a recognizable PEM (expected multi-line PEM, single-line with \\n escapes, or base64-encoded PEM)',
    );
  }
  return pem;
}
