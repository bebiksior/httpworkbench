import { useConfirm } from "primevue/useconfirm";

export const CONFIRM_INLINE_GROUP = "inline";

type InlineConfirmOptions = {
  message: string;
  acceptLabel: string;
  accept: () => void;
};

export const useConfirmInline = () => {
  const confirm = useConfirm();

  return (event: Event, options: InlineConfirmOptions) => {
    const target = event.currentTarget;
    confirm.require({
      group: CONFIRM_INLINE_GROUP,
      defaultFocus: "reject",
      target: target instanceof HTMLElement ? target : undefined,
      message: options.message,
      acceptProps: {
        label: options.acceptLabel,
        severity: "danger",
        size: "small",
      },
      rejectProps: {
        label: "Cancel",
        severity: "secondary",
        text: true,
        size: "small",
      },
      accept: options.accept,
    });
  };
};
