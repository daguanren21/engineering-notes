import {
  appendContext,
  collectResult,
  spawnContext,
  type ContextItem,
  type ContextKind,
  type ContextMode,
} from './model.ts'

export type ScenarioId = 'continue' | 'review' | 'parallel'

export interface AgentFrame {
  id: string
  label: string
  context: readonly ContextItem[]
  note: string
}

export interface Transfer {
  from: string
  to: string
  label: string
  kind: 'brief' | 'snapshot' | 'message' | 'result'
}

export interface LessonFrame {
  title: string
  explanation: string
  parent: AgentFrame
  children: readonly AgentFrame[]
  transfers: readonly Transfer[]
  events: readonly string[]
}

export const SCENARIOS: readonly {
  id: ScenarioId
  label: string
  description: string
}[] = [
  {
    id: 'continue',
    label: '继续执行',
    description: '观察快照、父级后续更新与显式消息之间的边界。',
  },
  {
    id: 'review',
    label: '独立评审',
    description: '比较中性 brief 与携带既有假设的 fork 快照。',
  },
  {
    id: 'parallel',
    label: '并行任务',
    description: '把两个任务分开派发，只向受影响的子代理发送更新。',
  },
]

function item(id: string, text: string, kind: ContextKind): ContextItem {
  return { id, text, kind }
}

function agent(
  id: string,
  label: string,
  context: readonly ContextItem[],
  note: string,
): AgentFrame {
  return { id, label, context, note }
}

function cloneAgent(source: AgentFrame): AgentFrame {
  return {
    ...source,
    context: spawnContext([], source.context, 'isolated'),
  }
}

function frame(
  title: string,
  explanation: string,
  parent: AgentFrame,
  children: readonly AgentFrame[],
  transfers: readonly Transfer[] = [],
  events: readonly string[] = [],
): LessonFrame {
  return {
    title,
    explanation,
    parent: cloneAgent(parent),
    children: children.map(cloneAgent),
    transfers: transfers.map((transfer) => ({ ...transfer })),
    events: [...events],
  }
}

function buildContinue(mode: ContextMode): readonly LessonFrame[] {
  const evidence = item(
    'continue-known-evidence',
    '已定位：取消之后仍会触发重试。',
    'fact',
  )
  const excludedCause = item(
    'continue-excluded-network',
    '已排除：网络故障；正常请求稳定。',
    'fact',
  )
  const task = item(
    'continue-task',
    '根据取消路径的调查实现修复，并补充回归验证。',
    'task',
  )
  const update = item(
    'continue-new-constraint',
    '新增约束：结论必须列出复核依据。',
    'constraint',
  )
  const parentAtStart = [evidence, excludedCause]
  const brief = mode === 'isolated' ? [evidence, task] : [task]
  const childAtSpawn = spawnContext(parentAtStart, brief, mode)
  const parentAfterUpdate = appendContext(parentAtStart, update)
  const childAfterMessage = appendContext(childAtSpawn, update)
  const childWithPrivateNote = appendContext(
    childAfterMessage,
    item(
      'continue-private-note',
      '私有检查记录：待核对的分支已经逐项检查。',
      'hypothesis',
    ),
  )
  const childFinished = appendContext(
    childWithPrivateNote,
    item(
      'continue-result',
      '结果：取消后停止重试，并附复核依据。',
      'result',
    ),
  )
  const parentFinished = collectResult(
    parentAfterUpdate,
    'continue-result',
    '结果：取消后停止重试，并附复核依据。',
  )

  return [
    frame(
      '父代理掌握已知证据',
      '先记录已经确认的事实，再决定交给子代理的任务范围。',
      agent('parent', '父代理', parentAtStart, '已定位取消路径，并排除了网络故障。'),
      [],
      [],
      ['父代理记录已知证据。'],
    ),
    frame(
      mode === 'fork' ? 'fork 复制当前父上下文' : 'isolated 接收明确 brief',
      mode === 'fork'
        ? '两条调查记录随快照传递，不必在任务描述里重述。'
        : '交接包包含定位结果，但没有已排除的原因；需要时可以明确补入 brief。',
      agent('parent', '父代理', parentAtStart, '派发时的父上下文保持不变。'),
      [
        agent(
          'continue-child',
          '执行代理',
          childAtSpawn,
          mode === 'fork'
            ? '看到父快照，并附加本次任务。'
            : '只看到 brief 中的已知证据与任务。',
        ),
      ],
      [
        {
          from: 'parent',
          to: 'continue-child',
          label: mode === 'fork' ? '父上下文快照 + 任务' : '已知证据 + 任务 brief',
          kind: mode === 'fork' ? 'snapshot' : 'brief',
        },
      ],
      ['创建子上下文快照。'],
    ),
    frame(
      '父代理新增约束',
      '父代理通过 appendContext 得到新状态；已经创建的子快照不会自动同步。',
      agent('parent', '父代理', parentAfterUpdate, '父上下文现在包含新增约束。'),
      [
        agent(
          'continue-child',
          '执行代理',
          childAtSpawn,
          '仍是派发时的快照，尚未看到新增约束。',
        ),
      ],
      [],
      ['父代理本地追加约束。', '子上下文保持原样。'],
    ),
    frame(
      '显式消息送达更新',
      '只有明确发送消息，子代理的上下文才追加这条新约束。',
      agent('parent', '父代理', parentAfterUpdate, '新增约束已经发出。'),
      [
        agent(
          'continue-child',
          '执行代理',
          childAfterMessage,
          '现在能够看到新增约束。',
        ),
      ],
      [
        {
          from: 'parent',
          to: 'continue-child',
          label: '新增约束',
          kind: 'message',
        },
      ],
      ['向执行代理显式发送更新。'],
    ),
    frame(
      '子代理完成本地工作',
      '检查过程留在子上下文中，父代理尚未收到这些新条目。',
      agent('parent', '父代理', parentAfterUpdate, '等待最终结果。'),
      [
        agent(
          'continue-child',
          '执行代理',
          childFinished,
          '本地上下文包含任务、更新、私有检查记录与最终结果。',
        ),
      ],
      [],
      ['执行代理形成最终结果。'],
    ),
    frame(
      '只把最终结果交回父代理',
      'collectResult 只追加 result；任务 brief 和私有检查记录都不会复制回父上下文。',
      agent('parent', '父代理', parentFinished, '只收到一条最终结果。'),
      [
        agent(
          'continue-child',
          '执行代理',
          childFinished,
          '完整本地上下文仍留在子代理一侧。',
        ),
      ],
      [
        {
          from: 'continue-child',
          to: 'parent',
          label: '最终结果',
          kind: 'result',
        },
      ],
      ['父代理聚合最终结果，不复制子代理历史。'],
    ),
  ]
}

function buildReview(mode: ContextMode): readonly LessonFrame[] {
  const diff = item(
    'review-diff',
    '差异事实：变更移除了空值分支，并新增提前返回。',
    'fact',
  )
  const acceptance = item(
    'review-acceptance',
    '验收约束：空值输入仍需产生明确错误。',
    'constraint',
  )
  const parentHypothesis = item(
    'review-parent-hypothesis',
    '父代理假设：问题可能与缓存失效有关。',
    'hypothesis',
  )
  const task = item(
    'review-task',
    '根据差异事实和验收约束做独立评审。',
    'task',
  )
  const parentAtStart = [diff, acceptance, parentHypothesis]
  const brief = mode === 'isolated' ? [diff, acceptance, task] : [task]
  const reviewerAtSpawn = spawnContext(parentAtStart, brief, mode)
  const reviewerFinished = appendContext(
    reviewerAtSpawn,
    item(
      'review-result',
      '评审结果：提前返回需要补充空值错误处理。',
      'result',
    ),
  )
  const parentFinished = collectResult(
    parentAtStart,
    'review-result',
    '评审结果：提前返回需要补充空值错误处理。',
  )
  const visibilityNote =
    mode === 'fork'
      ? '父代理的缓存假设也在评审输入中。'
      : '评审输入只含中性的差异、验收约束与任务。'

  return [
    frame(
      '父代理准备评审材料',
      '父上下文同时包含事实、验收约束和一个尚未证实的假设。',
      agent('parent', '父代理', parentAtStart, '事实与假设在父上下文中并存。'),
      [],
      [],
      ['区分事实、约束与假设。'],
    ),
    frame(
      mode === 'fork' ? 'fork 暴露既有假设' : 'isolated 发送中性评审 brief',
      mode === 'fork'
        ? 'fork 复制整个父快照，所以评审者也能看到尚未证实的缓存假设。'
        : 'isolated 只复制明确 brief，不把父代理的缓存假设带入评审。',
      agent('parent', '父代理', parentAtStart, '父上下文没有因派发而变化。'),
      [agent('review-child', '评审代理', reviewerAtSpawn, visibilityNote)],
      [
        {
          from: 'parent',
          to: 'review-child',
          label: mode === 'fork' ? '完整父快照 + 评审任务' : '差异 + 验收约束 + 任务',
          kind: mode === 'fork' ? 'snapshot' : 'brief',
        },
      ],
      ['创建评审上下文。'],
    ),
    frame(
      '可见性会改变输入边界',
      mode === 'fork'
        ? '既有假设成为额外输入，可能带来锚定风险；这不是对评审正确性的预测。'
        : '中性 brief 缩小了可见范围，但演示不声称这种模式必然得到更正确的评审。',
      agent('parent', '父代理', parentAtStart, '保留原始事实与假设。'),
      [agent('review-child', '评审代理', reviewerAtSpawn, visibilityNote)],
      [],
      ['比较输入中是否存在 review-parent-hypothesis。'],
    ),
    frame(
      '评审代理形成可交付结果',
      '结果描述需要复核的行为，不把父代理的假设当成定论。',
      agent('parent', '父代理', parentAtStart, '等待评审结果。'),
      [
        agent(
          'review-child',
          '评审代理',
          reviewerFinished,
          '最终条目描述需要复核的可观察行为。',
        ),
      ],
      [],
      ['追加一条评审结果。'],
    ),
    frame(
      '父代理只接收评审结果',
      '评审上下文不会整体回流；父代理只追加最终 result。',
      agent('parent', '父代理', parentFinished, '保留原上下文并增加评审结果。'),
      [
        agent(
          'review-child',
          '评审代理',
          reviewerFinished,
          '评审输入和本地状态留在子代理一侧。',
        ),
      ],
      [
        {
          from: 'review-child',
          to: 'parent',
          label: '评审结果',
          kind: 'result',
        },
      ],
      ['聚合最终评审结果。'],
    ),
  ]
}

function buildParallel(mode: ContextMode): readonly LessonFrame[] {
  const taskAConstraint = item(
    'parallel-a-constraint',
    '任务 A 验收：缓存键必须包含区域。',
    'constraint',
  )
  const taskBConstraint = item(
    'parallel-b-constraint',
    '任务 B 验收：错误文案必须说明下一步。',
    'constraint',
  )
  const taskA = item(
    'parallel-a-task',
    '核对缓存键实现是否满足任务 A 验收。',
    'task',
  )
  const taskB = item(
    'parallel-b-task',
    '核对错误文案是否满足任务 B 验收。',
    'task',
  )
  const taskAUpdate = item(
    'parallel-a-update',
    '任务 A 更新：区域值为空时使用明确占位符。',
    'constraint',
  )
  const globalParent = [taskAConstraint, taskBConstraint]
  const taskABrief = mode === 'isolated' ? [taskAConstraint, taskA] : [taskA]
  const taskBBrief = mode === 'isolated' ? [taskBConstraint, taskB] : [taskB]
  const childAAtSpawn = spawnContext(globalParent, taskABrief, mode)
  const childBAtSpawn = spawnContext(globalParent, taskBBrief, mode)
  const parentAfterUpdate = appendContext(globalParent, taskAUpdate)
  const childAAfterUpdate = appendContext(childAAtSpawn, taskAUpdate)
  const childAFinished = appendContext(
    childAAfterUpdate,
    item(
      'parallel-a-result',
      '任务 A 结果：缓存键已覆盖区域与空值占位符。',
      'result',
    ),
  )
  const childBFinished = appendContext(
    childBAtSpawn,
    item(
      'parallel-b-result',
      '任务 B 结果：错误文案包含可执行的下一步。',
      'result',
    ),
  )
  const parentWithA = collectResult(
    parentAfterUpdate,
    'parallel-a-result',
    '任务 A 结果：缓存键已覆盖区域与空值占位符。',
  )
  const parentFinished = collectResult(
    parentWithA,
    'parallel-b-result',
    '任务 B 结果：错误文案包含可执行的下一步。',
  )
  const scopeExplanation =
    mode === 'fork'
      ? '两个 fork 都复制全局父上下文，因此任务 A 看见任务 B 约束，任务 B 也看见任务 A 约束。'
      : '两个 isolated brief 各自只包含相关验收与任务，没有带入另一任务的条目。'

  return [
    frame(
      '父代理拆分两个独立任务',
      '全局父上下文暂时包含两组互不相关的验收约束。',
      agent('parent', '父代理', globalParent, '准备并行派发任务 A 与任务 B。'),
      [],
      [],
      ['识别两组独立任务上下文。'],
    ),
    frame(
      mode === 'fork' ? '两个 fork 复制全局上下文' : '两个 isolated 接收相关 brief',
      scopeExplanation,
      agent('parent', '父代理', globalParent, '并行创建两个子上下文。'),
      [
        agent('parallel-child-a', '任务 A 代理', childAAtSpawn, '负责缓存键任务。'),
        agent('parallel-child-b', '任务 B 代理', childBAtSpawn, '负责错误文案任务。'),
      ],
      [
        {
          from: 'parent',
          to: 'parallel-child-a',
          label: mode === 'fork' ? '全局快照 + 任务 A' : '任务 A brief',
          kind: mode === 'fork' ? 'snapshot' : 'brief',
        },
        {
          from: 'parent',
          to: 'parallel-child-b',
          label: mode === 'fork' ? '全局快照 + 任务 B' : '任务 B brief',
          kind: mode === 'fork' ? 'snapshot' : 'brief',
        },
      ],
      ['同时创建两个独立子上下文。'],
    ),
    frame(
      '比较任务上下文范围',
      `${scopeExplanation} 注意任务 A 是否也收到了任务 B 的验收项。`,
      agent('parent', '父代理', globalParent, '全局上下文仍包含两组约束。'),
      [
        agent('parallel-child-a', '任务 A 代理', childAAtSpawn, '检查可见条目是否与任务相关。'),
        agent('parallel-child-b', '任务 B 代理', childBAtSpawn, '检查可见条目是否与任务相关。'),
      ],
      [],
      ['比较两个子上下文中的条目 ID。'],
    ),
    frame(
      '父代理收到任务 A 更新',
      '更新先进入父上下文；两个既有子快照都不会自动改变。',
      agent('parent', '父代理', parentAfterUpdate, '新增信息只与任务 A 有关。'),
      [
        agent('parallel-child-a', '任务 A 代理', childAAtSpawn, '尚未收到更新。'),
        agent('parallel-child-b', '任务 B 代理', childBAtSpawn, '上下文保持原样。'),
      ],
      [],
      ['父代理本地追加任务 A 更新。'],
    ),
    frame(
      '更新只发送给任务 A',
      '显式消息定向到受影响的子代理；任务 B 的上下文不增加无关条目。',
      agent('parent', '父代理', parentAfterUpdate, '任务 A 更新已经发出。'),
      [
        agent('parallel-child-a', '任务 A 代理', childAAfterUpdate, '已收到空值占位符约束。'),
        agent('parallel-child-b', '任务 B 代理', childBAtSpawn, '未收到无关的任务 A 更新。'),
      ],
      [
        {
          from: 'parent',
          to: 'parallel-child-a',
          label: '任务 A 更新',
          kind: 'message',
        },
      ],
      ['只向任务 A 代理显式发送更新。'],
    ),
    frame(
      '两个子代理分别形成结果',
      '两个子代理只更新各自的上下文，父代理尚未收到结果。',
      agent('parent', '父代理', parentAfterUpdate, '等待两个最终结果。'),
      [
        agent('parallel-child-a', '任务 A 代理', childAFinished, '任务 A 结果已经形成。'),
        agent('parallel-child-b', '任务 B 代理', childBFinished, '任务 B 结果已经形成。'),
      ],
      [],
      ['任务 A 与任务 B 各自产生一条最终结果。'],
    ),
    frame(
      '父代理聚合结果而非历史',
      '父上下文追加两个 result，不复制任一子代理的任务 brief 或完整上下文。',
      agent('parent', '父代理', parentFinished, '拥有全局约束、定向更新与两个最终结果。'),
      [
        agent('parallel-child-a', '任务 A 代理', childAFinished, '本地上下文留在任务 A 一侧。'),
        agent('parallel-child-b', '任务 B 代理', childBFinished, '本地上下文留在任务 B 一侧。'),
      ],
      [
        {
          from: 'parallel-child-a',
          to: 'parent',
          label: '任务 A 结果',
          kind: 'result',
        },
        {
          from: 'parallel-child-b',
          to: 'parent',
          label: '任务 B 结果',
          kind: 'result',
        },
      ],
      ['父代理仅聚合两个最终结果。'],
    ),
  ]
}

export function buildFrames(
  id: ScenarioId,
  mode: ContextMode,
): readonly LessonFrame[] {
  switch (id) {
    case 'continue':
      return buildContinue(mode)
    case 'review':
      return buildReview(mode)
    case 'parallel':
      return buildParallel(mode)
    default: {
      const unreachable: never = id
      throw new Error(`Unsupported scenario: ${unreachable}`)
    }
  }
}
