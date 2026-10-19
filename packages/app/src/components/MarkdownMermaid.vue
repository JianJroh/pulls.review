<script setup lang="ts">
import { renderMermaidSVG } from 'beautiful-mermaid'
import { computed } from 'vue'

const props = defineProps<{
  content: string
}>()

// `beautiful-mermaid` covers fewer diagram types than GitHub's renderer and throws on
// the rest (and on invalid source), which then stays readable as the code block it was.
const svg = computed(() => {
  try {
    return renderMermaidSVG(props.content, {
      bg: 'var(--mermaid-background)',
      fg: 'var(--mermaid-foreground)',
      transparent: true,
      padding: 16,
    })
  }
  catch {
    return undefined
  }
})
</script>

<template>
  <div v-if="svg" class="markdown-mermaid" v-html="svg" />
  <pre v-else><code>{{ content }}</code></pre>
</template>
