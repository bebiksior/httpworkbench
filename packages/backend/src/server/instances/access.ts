import { GUEST_OWNER_ID, type Instance, type User } from "shared";

export const canReadInstance = ({
  instance,
  user,
}: {
  instance: Instance;
  user: User | undefined;
}) => {
  if (instance.ownerId === GUEST_OWNER_ID) {
    return true;
  }

  if (user?.id === instance.ownerId) {
    return true;
  }

  return instance.public;
};
