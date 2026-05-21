import { Global, Module } from '@nestjs/common';
import { GithubAppService } from './github-app.service';
import { GithubPrService } from './github-pr.service';

@Global()
@Module({
  providers: [GithubAppService, GithubPrService],
  exports: [GithubAppService, GithubPrService],
})
export class GithubModule {}
