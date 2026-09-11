<script setup lang="ts">
import { computed } from "vue";
import { parseFlowDiagram } from "../../content/flow";

const props = defineProps<{
  source: string;
}>();

/**
 * Parsed at render time rather than passed in as structured props, so the same
 * component works from the markdown fence with no build-time coupling. SSG and
 * the client run the same parser over the same text, so the markup matches.
 */
const parsed = computed(() => parseFlowDiagram(props.source));
const diagram = computed(() => parsed.value.diagram);
</script>

<template>
  <figure v-if="diagram" class="flow">
    <figcaption v-if="diagram.title || diagram.caption" class="flow__caption">
      <strong v-if="diagram.title">{{ diagram.title }}</strong>
      <span v-if="diagram.caption">{{ diagram.caption }}</span>
    </figcaption>

    <ol class="flow__layers">
      <li v-for="(layer, index) in diagram.layers" :key="index" class="flow__layer">
        <p class="flow__label">{{ layer.label }}</p>
        <ul class="flow__boxes">
          <li
            v-for="(box, boxIndex) in layer.boxes"
            :key="boxIndex"
            class="flow__box"
            :class="{ 'flow__box--accent': box.accent }"
          >
            {{ box.label }}
          </li>
        </ul>
        <span v-if="index < diagram.layers.length - 1" class="flow__arrow" aria-hidden="true">↓</span>
      </li>
    </ol>
  </figure>

  <!--
    A malformed diagram would otherwise vanish silently. Showing the source
    keeps the article readable and makes the fault obvious.
  -->
  <pre v-else class="flow flow--broken"><code>{{ source.trim() }}</code></pre>
</template>

<style scoped>
.flow {
  margin: 2.6rem 0 0;
  padding: 0;
}

.flow__caption {
  display: grid;
  gap: 5px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--line-strong);
}

.flow__caption strong {
  color: var(--ink);
  font-family: var(--font-sans);
  font-size: 0.95rem;
  font-weight: 500;
  letter-spacing: -0.01em;
}

.flow__caption span {
  color: var(--muted);
  font-family: var(--font-sans);
  font-size: 0.78rem;
  line-height: 1.6;
}

.flow__layers {
  margin: 0;
  padding: 0;
  list-style: none;
}

.flow__layer {
  position: relative;
  display: grid;
  grid-template-columns: minmax(96px, 0.2fr) minmax(0, 1fr);
  gap: 18px;
  align-items: start;
  padding-block: 16px;
}

.flow__layer + .flow__layer {
  border-top: 1px solid var(--line);
}

.flow__label {
  margin: 0;
  padding-top: 11px;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  line-height: 1.45;
}

.flow__boxes {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.flow__box {
  flex: 1 1 132px;
  min-width: 0;
  padding: 11px 13px;
  border: 1px solid var(--line-strong);
  color: var(--ink);
  background: var(--surface);
  font-family: var(--font-sans);
  font-size: 0.82rem;
  font-weight: 500;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.flow__box--accent {
  border-color: var(--accent);
  border-top-width: 3px;
  color: var(--accent);
}

.flow__arrow {
  position: absolute;
  bottom: -9px;
  left: calc(96px + 18px + 20px);
  z-index: 1;
  color: var(--accent);
  font-size: 0.9rem;
  line-height: 1;
}

@media (max-width: 620px) {
  .flow__layer {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }

  .flow__label {
    padding-top: 0;
  }

  .flow__arrow {
    left: 20px;
  }
}
</style>
