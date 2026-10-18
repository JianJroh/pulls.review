import type { DiffsPayload, GroupedResult } from '@pulls.review/core/types'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import nestedGroups from '../../../test/fixtures/synthetic/nested-groups.json'
import partiallyReviewed from '../../../test/fixtures/synthetic/partially-reviewed.json'
import { i18n } from '../../i18n'
import { createMockDiffsStore } from '../../stores/mock-diffs-store'
import DiffGroup from './DiffGroup.vue'
import FileTree from './FileTree.vue'

const wrappers: ReturnType<typeof mount>[] = []

// Keep the group/tree navigation real while replacing the external diff renderer.
const FileDiffStub = defineComponent({
  setup(_, { expose }) {
    const expanded = ref(false)
    expose({
      expand: () => {
        expanded.value = true
      },
    })
    return () => h('div', { 'data-expanded': expanded.value })
  },
})

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  document.body.innerHTML = ''
})

function mountGroup(embedded: boolean, nested = false) {
  const fixture = nested ? nestedGroups : partiallyReviewed
  const store = createMockDiffsStore({ diff: fixture.diff as DiffsPayload, grouped: fixture.grouped as GroupedResult })
  const host = document.createElement('div')
  document.body.append(host)
  const root = embedded ? host.attachShadow({ mode: 'open' }) : document
  const container = document.createElement('div')
  ;(embedded ? root : host).append(container)
  const group = store.groups[0]!
  const wrapper = mount(DiffGroup, {
    props: { store, group, collapsed: false, filesVisible: [], document: root },
    global: { plugins: [i18n], stubs: { FileDiff: FileDiffStub } },
    attachTo: container,
  })
  wrappers.push(wrapper)
  return { root, wrapper, group }
}

describe('diffGroup navigation', () => {
  it.each([false, true])('expands and locates the file in its own root (embedded=%s)', async (embedded) => {
    const { root, wrapper, group } = mountGroup(embedded)
    const file = group.files[0]!
    const marker = root.querySelector<HTMLElement>(`[data-file-start="${file.sha}"]`)!
    const scroll = vi.fn()
    marker.scrollIntoView = scroll
    // Place the target below the viewport so navigating must scroll it.
    marker.style.scrollMarginTop = '0px'
    marker.getBoundingClientRect = () => new DOMRect(0, 500, 100, 0)
    const outside = document.createElement('div')
    outside.dataset.fileStart = file.sha
    outside.scrollIntoView = vi.fn()
    if (embedded)
      document.body.prepend(outside)

    wrapper.findComponent(FileTree).vm.$emit('navigate', file.sha)
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-expanded="true"]').exists()).toBe(true)
    expect(scroll).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
    expect(outside.scrollIntoView).not.toHaveBeenCalled()
    marker.getBoundingClientRect = () => new DOMRect()
    root.dispatchEvent(new Event('scrollend'))
  })

  it('returns from a nested group to its parent inside the ShadowRoot', async () => {
    const { root, wrapper, group } = mountGroup(true, true)
    const parent = root.getElementById(`group-${group.key}`)!
    parent.scrollIntoView = vi.fn()
    const outside = document.createElement('div')
    outside.id = parent.id
    outside.scrollIntoView = vi.fn()
    document.body.prepend(outside)

    const back = wrapper.findAll('button').find(button => button.text() === `${group.label} ›`)!
    await back.trigger('click')

    expect(parent.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
    expect(outside.scrollIntoView).not.toHaveBeenCalled()
  })
})
