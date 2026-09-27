/** Demo avatar paths served from /public/avatars */
export const AGENT_AVATAR_SRC = "/avatars/avatar-agent.png";

const CUSTOMER_AVATARS: Record<string, string> = {
  "CUST-1001": "/avatars/avatar-ananya.png",
  "CUST-1002": "/avatars/avatar-rohan.png",
  "CUST-1003": "/avatars/avatar-meera.png",
  "CUST-1004": "/avatars/avatar-kabir.png",
  "CUST-1005": "/avatars/avatar-ishita.png",
  "CUST-1006": "/avatars/avatar-dev.png",
  "CUST-1007": "/avatars/avatar-sana.png",
};

export function customerAvatarSrc(customerId: string | null | undefined): string {
  if (!customerId) return "/avatars/avatar-ananya.png";
  return CUSTOMER_AVATARS[customerId.trim().toUpperCase()] ?? "/avatars/avatar-ananya.png";
}
