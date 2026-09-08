import { ViteSSG } from "vite-ssg";
import routes from "~pages";
import App from "./App.vue";
import ArticleLayout from "./components/article/ArticleLayout.vue";
import "./styles/global.css";

export const createApp = ViteSSG(
  App,
  {
    base: import.meta.env.BASE_URL,
    routes,
    scrollBehavior(to, _from, savedPosition) {
      if (savedPosition) return savedPosition;
      if (to.hash) return { el: to.hash, top: 24, behavior: "smooth" };
      return { top: 0 };
    },
  },
  ({ app }) => {
    app.component("ArticleLayout", ArticleLayout);
  },
);
