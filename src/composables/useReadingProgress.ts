import { onBeforeUnmount, onMounted, ref } from "vue";

/**
 * Fraction of the document scrolled, sampled at most once per frame.
 * Reads only, so it is safe to run alongside scroll-driven CSS.
 */
export function useReadingProgress() {
  const progress = ref(0);
  let frame = 0;

  const measure = () => {
    frame = 0;
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    progress.value =
      scrollable <= 0 ? 0 : Math.min(1, Math.max(0, window.scrollY / scrollable));
  };

  const schedule = () => {
    if (frame !== 0) return;
    frame = window.requestAnimationFrame(measure);
  };

  onMounted(() => {
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
  });

  onBeforeUnmount(() => {
    if (frame !== 0) window.cancelAnimationFrame(frame);
    window.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
  });

  return progress;
}
