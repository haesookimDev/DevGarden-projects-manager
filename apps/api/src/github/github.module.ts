import { Global, Module } from '@nestjs/common';
import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';

import { GithubAppService } from './github-app.service';
import { GithubPrService } from './github-pr.service';
import { GithubRegistrationsInternalController } from './github-registrations.internal.controller';
import {
  GithubRegistrationsService,
  OCTOKIT_FACTORY,
  type OctokitFactory,
} from './github-registrations.service';

const defaultOctokitFactory: OctokitFactory = ({ appId, privateKey }) =>
  new Octokit({ authStrategy: createAppAuth, auth: { appId, privateKey } });

@Global()
@Module({
  controllers: [GithubRegistrationsInternalController],
  providers: [
    GithubAppService,
    GithubPrService,
    GithubRegistrationsService,
    { provide: OCTOKIT_FACTORY, useValue: defaultOctokitFactory },
  ],
  exports: [GithubAppService, GithubPrService, GithubRegistrationsService],
})
export class GithubModule {}
