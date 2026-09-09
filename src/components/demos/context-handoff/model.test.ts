import { deepEqual, equal, ok } from 'node:assert/strict'
import test from 'node:test'

import {
  appendContext,
  collectResult,
  runExample,
  spawnContext,
  type ContextItem,
} from './model.ts'
import { buildFrames, SCENARIOS } from './scenarios.ts'

type MutableItem = {
  -readonly [Key in keyof ContextItem]: ContextItem[Key]
}

test('spawned snapshots and timeline frames do not share mutable state', () => {
  const parent: MutableItem[] = [
    { id: 'parent-fact', text: 'original parent fact', kind: 'fact' },
  ]
  const brief: MutableItem[] = [
    { id: 'child-task', text: 'original child task', kind: 'task' },
  ]

  const fork = spawnContext(parent, brief, 'fork')
  const isolated = spawnContext(parent, brief, 'isolated')

  parent[0]!.text = 'changed parent fact'
  parent.push({ id: 'later-parent-item', text: 'added later', kind: 'constraint' })
  brief[0]!.text = 'changed child task'

  deepEqual(fork, [
    { id: 'parent-fact', text: 'original parent fact', kind: 'fact' },
    { id: 'child-task', text: 'original child task', kind: 'task' },
  ])
  deepEqual(isolated, [
    { id: 'child-task', text: 'original child task', kind: 'task' },
  ])

  const frames = buildFrames('continue', 'fork')
  const firstContext = frames[0]!.parent.context as MutableItem[]
  const laterContext = frames[1]!.parent.context
  const laterText = laterContext[0]!.text

  firstContext[0]!.text = 'mutated first frame'
  firstContext.push({ id: 'frame-only', text: 'first frame only', kind: 'fact' })

  equal(laterContext[0]!.text, laterText)
})

test('updates require explicit delivery and result collection excludes child history', () => {
  const parent: ContextItem[] = [
    { id: 'known-fact', text: 'known fact', kind: 'fact' },
  ]
  const brief: ContextItem[] = [
    { id: 'delegated-task', text: 'delegated task', kind: 'task' },
  ]
  const update: ContextItem = {
    id: 'new-constraint',
    text: 'new constraint',
    kind: 'constraint',
  }

  const childAtSpawn = spawnContext(parent, brief, 'isolated')
  const parentAfterUpdate = appendContext(parent, update)

  deepEqual(childAtSpawn.map(({ id }) => id), ['delegated-task'])
  deepEqual(parentAfterUpdate.map(({ id }) => id), ['known-fact', 'new-constraint'])

  const childAfterDelivery = appendContext(childAtSpawn, update)
  const childWithPrivateWork = appendContext(childAfterDelivery, {
    id: 'private-work',
    text: 'private work note',
    kind: 'hypothesis',
  })
  const parentAfterResult = collectResult(parentAfterUpdate, 'final-result', 'final result')

  deepEqual(childWithPrivateWork.map(({ id }) => id), [
    'delegated-task',
    'new-constraint',
    'private-work',
  ])
  deepEqual(parentAfterResult.map(({ id }) => id), [
    'known-fact',
    'new-constraint',
    'final-result',
  ])

  const example = runExample('isolated')
  const afterParentOnlyUpdate = example.afterParentOnlyUpdate as {
    child: ContextItem[]
  }
  const afterExplicitDelivery = example.afterExplicitDelivery as {
    child: ContextItem[]
  }
  const afterResultReturn = example.afterResultReturn as {
    returnedItems: ContextItem[]
  }

  equal(
    afterParentOnlyUpdate.child.some(({ id }) => id === 'example-update'),
    false,
  )
  equal(
    afterExplicitDelivery.child.some(({ id }) => id === 'example-update'),
    true,
  )
  deepEqual(afterResultReturn.returnedItems.map(({ id, kind }) => ({ id, kind })), [
    { id: 'example-result', kind: 'result' },
  ])
})

test('isolated parallel agents receive task-specific briefs and targeted updates', () => {
  const frames = buildFrames('parallel', 'isolated')
  const spawned = frames[1]!
  const afterTargetedUpdate = frames[4]!
  const childA = spawned.children.find(({ id }) => id === 'parallel-child-a')
  const childB = spawned.children.find(({ id }) => id === 'parallel-child-b')
  const updatedA = afterTargetedUpdate.children.find(
    ({ id }) => id === 'parallel-child-a',
  )
  const unchangedB = afterTargetedUpdate.children.find(
    ({ id }) => id === 'parallel-child-b',
  )

  ok(childA)
  ok(childB)
  ok(updatedA)
  ok(unchangedB)
  deepEqual(childA.context.map(({ id }) => id), [
    'parallel-a-constraint',
    'parallel-a-task',
  ])
  deepEqual(childB.context.map(({ id }) => id), [
    'parallel-b-constraint',
    'parallel-b-task',
  ])
  equal(updatedA.context.some(({ id }) => id === 'parallel-a-update'), true)
  equal(unchangedB.context.some(({ id }) => id === 'parallel-a-update'), false)
})

test('scenario frames keep unique message ids within each agent', () => {
  for (const scenario of SCENARIOS) {
    for (const mode of ['isolated', 'fork'] as const) {
      const frames = buildFrames(scenario.id, mode)

      for (const [frameIndex, lesson] of frames.entries()) {
        for (const currentAgent of [lesson.parent, ...lesson.children]) {
          const ids = currentAgent.context.map(({ id }) => id)
          equal(
            new Set(ids).size,
            ids.length,
            `${scenario.id}/${mode} frame ${frameIndex} duplicates ids for ${currentAgent.id}`,
          )
        }
      }
    }
  }
})
