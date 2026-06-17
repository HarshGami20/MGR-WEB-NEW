/** Android notification channel id — must match the mobile app manifest + channel setup. */
export const FCM_ANDROID_CHANNEL_ID = "default";

export function fcmMulticastAndroidOptions(): {
  priority: "high";
  notification: { channelId: string; sound: string; priority: "high" };
} {
  return {
    priority: "high",
    notification: {
      channelId: FCM_ANDROID_CHANNEL_ID,
      sound: "default",
      priority: "high",
    },
  };
}
