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
    const v = process.env.GITHUB_APP_PRIVATE_KEY;
    if (!v) throw new InternalServerErrorException('GITHUB_APP_PRIVATE_KEY is not set');
    return v.replace(/\\n/g, '\n');
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
