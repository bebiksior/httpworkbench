export const loadInstanceDetailPage = () =>
  import("./index").then((module) => module.InstanceDetail);
