'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { createInternalTodo, setTodoStatus, type TodoStatus } from '@/lib/api/todos';

export async function createInternalTodoAction(formData: FormData): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: '세션이 만료되었습니다.' };
  const projectId = String(formData.get('projectId') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim() || undefined;
  if (!projectId || !title) return { error: 'projectId 와 title 은 필수입니다.' };
  try {
    await createInternalTodo({ projectId, title, body });
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'create failed' };
  }
  revalidatePath('/dashboard/tasks');
  return {};
}

export async function updateTodoStatusAction(id: string, status: TodoStatus): Promise<void> {
  await setTodoStatus(id, status);
  revalidatePath('/dashboard/tasks');
}
