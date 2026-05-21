import { z } from 'zod';

export const RunStatus = z.enum(['queued', 'running', 'success', 'failed', 'cancelled']);
export type RunStatus = z.infer<typeof RunStatus>;
