import { Global, Module } from '@nestjs/common';
import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';

import { GithubAppService } from './github-app.service';
import { GithubInstallationsInternalController } from './github-installations.internal.controller';
import {
  GithubInstallationsService,
  USER_OCTOKIT_FACTORY,
  type UserOctokitFactory,
} from './github-installations.service';
import { GithubManifestService } from './github-manifest.service';
import { GithubManifestPublicController } from './github-manifest.public.controller';
import { GithubPrService } from './github-pr.service';
import { GithubRegistrationsInternalController } from './github-registrations.internal.controller';
import {
  GithubRegistrationsService,
  OCTOKIT_FACTORY,
  type OctokitFactory,
} from './github-registrations.service';
import { ManifestStateService } from './manifest-state.service';

const defaultOctokitFactory: OctokitFactory = ({ appId, privateKey }) =>
  // Manifest conversion calls don't require auth, so pass anonymous Octokit
  // when appId is 0 (the manifest service sentinel).
  appId === 0
    ? new Octokit()
    : new Octokit({ authStrategy: createAppAuth, auth: { appId, privateKey } });

const defaultUserOctokitFactory: UserOctokitFactory = (token) => new Octokit({ auth: token });

@Global()
@Module({
  controllers: [
    GithubRegistrationsInternalController,
    GithubInstallationsInternalController,
    GithubManifestPublicController,
  ],
  providers: [
    GithubAppService,
    GithubPrService,
    GithubRegistrationsService,
    GithubManifestService,
    GithubInstallationsService,
    ManifestStateService,
    { provide: OCTOKIT_FACTORY, useValue: defaultOctokitFactory },
    { provide: USER_OCTOKIT_FACTORY, useValue: defaultUserOctokitFactory },
  ],
  exports: [
    GithubAppService,
    GithubPrService,
    GithubRegistrationsService,
    GithubManifestService,
    GithubInstallationsService,
  ],
})
export class GithubModule {}
