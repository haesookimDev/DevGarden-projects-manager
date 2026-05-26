import { InternalServerErrorException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import {
  buildManifest,
  DEFAULT_APP_NAME,
  DEFAULT_EVENTS,
  DEFAULT_PERMISSIONS,
  manifestSubmitUrl,
} from './manifest-builder';

describe('buildManifest', () => {
  it('builds a manifest with the documented defaults at a public base url', () => {
    const m = buildManifest({ publicBaseUrl: 'https://example.com' });
    expect(m.name).toBe(DEFAULT_APP_NAME);
    expect(m.url).toBe('https://example.com');
    expect(m.hook_attributes).toEqual({
      url: 'https://example.com/webhooks/github',
      active: true,
    });
    expect(m.redirect_url).toBe('https://example.com/webhooks/github/manifest-callback');
    expect(m.setup_url).toBe('https://example.com/dashboard/onboarding/installed');
    expect(m.public).toBe(false);
    expect(m.default_permissions).toEqual(DEFAULT_PERMISSIONS);
    expect(m.default_events).toEqual(DEFAULT_EVENTS);
    expect(m.request_oauth_on_install).toBe(false);
  });

  it('strips a trailing slash from the base url', () => {
    const m = buildManifest({ publicBaseUrl: 'https://example.com/' });
    expect(m.url).toBe('https://example.com');
    expect(m.hook_attributes.url).toBe('https://example.com/webhooks/github');
  });

  it('honors overrides for app name and description', () => {
    const m = buildManifest({
      publicBaseUrl: 'https://x.test',
      appName: 'My Org DevGarden',
      description: 'custom blurb',
    });
    expect(m.name).toBe('My Org DevGarden');
    expect(m.description).toBe('custom blurb');
  });

  it('rejects scheme-less URLs — GitHub would refuse the manifest', () => {
    expect(() => buildManifest({ publicBaseUrl: 'example.com' })).toThrow(
      InternalServerErrorException,
    );
  });
});

describe('manifestSubmitUrl', () => {
  it('returns the github.com create-app URL with state query', () => {
    expect(manifestSubmitUrl('abc/+ 123')).toBe(
      'https://github.com/settings/apps/new?state=abc%2F%2B%20123',
    );
  });
});
