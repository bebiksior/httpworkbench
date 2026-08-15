import type { Component } from "vue";

export type SelectMenuOption = {
  value: string;
  label: string;
  description?: string;
  icon?: Component;
};
