import { describe, expect, it, vi } from 'vitest';
import { EmailChannel } from './email.channel';

describe('EmailChannel', () => {
  it('is not configured and no-ops when no transport is provided', async () => {
    const channel = new EmailChannel(null);
    expect(channel.configured).toBe(false);
    expect(await channel.send('a@b.co', 'subj', 'body')).toBe(false);
  });

  it('sends via the transport and reports success', async () => {
    const sendMail = vi.fn().mockResolvedValue(undefined);
    const channel = new EmailChannel({ sendMail });

    const ok = await channel.send('a@b.co', 'Run failed', 'something broke');

    expect(ok).toBe(true);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@b.co', subject: 'Run failed', text: 'something broke' }),
    );
  });

  it('returns false (does not throw) when the transport rejects', async () => {
    const channel = new EmailChannel({
      sendMail: vi.fn().mockRejectedValue(new Error('smtp down')),
    });
    expect(await channel.send('a@b.co', 'subj', 'body')).toBe(false);
  });
});
