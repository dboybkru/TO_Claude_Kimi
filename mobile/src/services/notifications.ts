import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import api from '../api/client'

const PUSH_TOKEN_KEY = '@push_token'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web') return null

  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }
  if (finalStatus !== 'granted') return null

  const token = (await Notifications.getExpoPushTokenAsync()).data
  await AsyncStorage.setItem(PUSH_TOKEN_KEY, token)
  
  // Send token to backend
  try {
    await api.post('/users/push-token', { push_token: token, platform: Platform.OS })
  } catch {
    // Silent fail — token saved locally
  }
  
  return token
}

export async function sendLocalNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>,
) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data: data || {} },
    trigger: null, // immediate
  })
}

export async function getPushToken(): Promise<string | null> {
  return AsyncStorage.getItem(PUSH_TOKEN_KEY)
}

export function addNotificationListener(
  callback: (notification: Notifications.Notification) => void,
) {
  return Notifications.addNotificationReceivedListener(callback)
}

export function addNotificationResponseListener(
  callback: (response: Notifications.NotificationResponse) => void,
) {
  return Notifications.addNotificationResponseReceivedListener(callback)
}
