'use server';

import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { createRun } from '@/lib/api/runs';
import type { CreateRunFormState } from './state';

export async function createRunAction(
  _prev: CreateRunFormState,
  formData: FormData,
): Promise<CreateRunFormState> {
  const session = await auth();
  const ownerId = session?.user?.id;
  if (!ownerId) {
    return { error: '세션이 만료되었습니다. 다시 로그인하세요.' };
  }

  const projectId = String(formData.get('projectId') ?? '').trim();
  const harnessId = String(formData.get('harnessId') ?? '').trim();
  const clientId = String(formData.get('clientId') ?? '').trim();
  if (!projectId || !harnessId || !clientId) {
    return { error: 'project · harness · client 를 모두 선택해야 합니다.' };
  }

  const branchName = String(formData.get('branchName') ?? '').trim() || undefined;
  const workingDir = String(formData.get('workingDir') ?? '').trim() || undefined;

  const rawInputs = String(formData.get('inputs') ?? '').trim();
  let inputs: Record<string, unknown> | undefined;
  if (rawInputs) {
    try {
      const parsed = JSON.parse(rawInputs) as unknown;
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return { error: 'inputs 는 JSON object 여야 합니다.' };
      }
      inputs = parsed as Record<string, unknown>;
    } catch {
      return { error: 'inputs 가 유효한 JSON 이 아닙니다.' };
    }
  }

  let runId: string;
  try {
    const run = await createRun({
      projectId,
      harnessId,
      clientId,
      triggeredByUserId: ownerId,
      branchName,
      workingDir,
      inputs,
    });
    runId = run.id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'run 생성 실패' };
  }

  redirect(`/dashboard/runs/${runId}`);
}
