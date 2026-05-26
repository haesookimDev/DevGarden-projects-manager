import { Global, Module } from '@nestjs/common';
import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';

import { GithubAppService } from './github-app.service';
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

@Global()
@Module({
  controllers: [GithubRegistrationsInternalController, GithubManifestPublicController],
  providers: [
    GithubAppService,
    GithubPrService,
    GithubRegistrationsService,
    GithubManifestService,
    ManifestStateService,
    { provide: OCTOKIT_FACTORY, useValue: defaultOctokitFactory },
  ],
  exports: [GithubAppService, GithubPrService, GithubRegistrationsService, GithubManifestService],
})
export class GithubModule {}
