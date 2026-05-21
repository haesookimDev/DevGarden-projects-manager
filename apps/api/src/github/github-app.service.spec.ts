import { InternalServerErrorException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GithubAppService } from './github-app.service';

const originalAppId = process.env.GITHUB_APP_ID;
const originalPrivateKey = process.env.GITHUB_APP_PRIVATE_KEY;

function restore(envVar: string, value: string | undefined) {
  if (value === undefined) delete process.env[envVar];
  else process.env[envVar] = value;
}

describe('GithubAppService — env access', () => {
  let svc: GithubAppService;

  beforeEach(() => {
    svc = new GithubAppService();
  });

  afterEach(() => {
    restore('GITHUB_APP_ID', originalAppId);
    restore('GITHUB_APP_PRIVATE_KEY', originalPrivateKey);
  });

  it('appId throws when GITHUB_APP_ID is missing', () => {
    delete process.env.GITHUB_APP_ID;
    expect(() => svc.appId()).toThrow(InternalServerErrorException);
  });

  it('appId throws when GITHUB_APP_ID is not numeric', () => {
    process.env.GITHUB_APP_ID = 'not-a-number';
    expect(() => svc.appId()).toThrow(InternalServerErrorException);
  });

  it('appId returns the parsed numeric value', () => {
    process.env.GITHUB_APP_ID = '12345';
    expect(svc.appId()).toBe(12345);
  });

  it('privateKey throws when missing', () => {
    delete process.env.GITHUB_APP_PRIVATE_KEY;
    expect(() => svc.privateKey()).toThrow(InternalServerErrorException);
  });

  it('privateKey unescapes literal \\n into real newlines', () => {
    process.env.GITHUB_APP_PRIVATE_KEY = '-----BEGIN-----\\nABC\\n-----END-----';
    expect(svc.privateKey()).toBe('-----BEGIN-----\nABC\n-----END-----');
  });
});
