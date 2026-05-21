import { Global, Module } from '@nestjs/common';
import { GithubAppService } from './github-app.service';

@Global()
@Module({
  providers: [GithubAppService],
  exports: [GithubAppService],
})
export class GithubModule {}
