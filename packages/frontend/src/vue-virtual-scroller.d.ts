declare module "vue-virtual-scroller" {
  import type { Plugin, Component } from "vue";

  export const RecycleScroller: Component;
  export const DynamicScroller: Component;
  export const DynamicScrollerItem: Component;

  const plugin: Plugin;
  export default plugin;
}
