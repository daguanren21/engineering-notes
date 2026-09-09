export type ContextMode = 'isolated' | 'fork'

export type ContextKind = 'fact' | 'hypothesis' | 'constraint' | 'task' | 'result'

export interface ContextItem {
  readonly id: string
  readonly text: string
  readonly kind: ContextKind
}

function copyContext(context: readonly ContextItem[]): ContextItem[] {
  return context.map((item) => ({ ...item }))
}

export function spawnContext(
  parent: readonly ContextItem[],
  brief: readonly ContextItem[],
  mode: ContextMode,
): ContextItem[] {
  return mode === 'fork'
    ? copyContext([...parent, ...brief])
    : copyContext(brief)
}

export function appendContext(
  context: readonly ContextItem[],
  message: ContextItem,
): ContextItem[] {
  return [...copyContext(context), { ...message }]
}

export function collectResult(
  parent: readonly ContextItem[],
  id: string,
  text: string,
): ContextItem[] {
  return appendContext(parent, { id, text, kind: 'result' })
}

export function runExample(mode: ContextMode): Record<string, unknown> {
  const parent: ContextItem[] = [
    { id: 'example-fact', text: '已确认：交接只返回最终结果。', kind: 'fact' },
  ]
  const brief: ContextItem[] = [
    { id: 'example-task', text: '检查新的交接约束。', kind: 'task' },
  ]
  const update: ContextItem = {
    id: 'example-update',
    text: '新增约束：结果必须包含复核依据。',
    kind: 'constraint',
  }

  const childAtSpawn = spawnContext(parent, brief, mode)
  const parentAfterUpdate = appendContext(parent, update)
  const childBeforeDelivery = copyContext(childAtSpawn)
  const childAfterDelivery = appendContext(childAtSpawn, update)
  const childBeforeReturn = appendContext(childAfterDelivery, {
    id: 'example-private-note',
    text: '私有检查记录：已逐项核对分支。',
    kind: 'hypothesis',
  })
  const parentAfterResult = collectResult(
    parentAfterUpdate,
    'example-result',
    '最终结果：新增约束已满足，并附复核依据。',
  )

  return {
    mode,
    atSpawn: { parent: copyContext(parent), child: copyContext(childAtSpawn) },
    afterParentOnlyUpdate: {
      parent: parentAfterUpdate,
      child: childBeforeDelivery,
    },
    afterExplicitDelivery: { child: childAfterDelivery },
    beforeReturn: { child: childBeforeReturn },
    afterResultReturn: {
      parent: parentAfterResult,
      returnedItems: copyContext(parentAfterResult.slice(parentAfterUpdate.length)),
    },
  }
}
