import React, { useEffect, useState } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createStackNavigator } from '@react-navigation/stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'

import { useAuthStore } from '../store/authStore'

import LoginScreen from '../screens/LoginScreen'
import DashboardScreen from '../screens/DashboardScreen'
import ObjectsScreen from '../screens/ObjectsScreen'
import ObjectDetailScreen from '../screens/ObjectDetailScreen'
import JournalFormScreen from '../screens/JournalFormScreen'
import ProfileScreen from '../screens/ProfileScreen'
import QRScannerScreen from '../screens/QRScannerScreen'

const Stack = createStackNavigator()
const BottomTab = createBottomTabNavigator()

function ObjectsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ObjectsList" component={ObjectsScreen} />
      <Stack.Screen name="ObjectDetail" component={ObjectDetailScreen} />
    </Stack.Navigator>
  )
}

function MainTabs() {
  return (
    <BottomTab.Navigator screenOptions={{ headerShown: false }}>
      <BottomTab.Screen name="Объекты" component={ObjectsStack} />
      <BottomTab.Screen name="Журналы" component={DashboardScreen} />
      <BottomTab.Screen name="Профиль" component={ProfileScreen} />
    </BottomTab.Navigator>
  )
}

export default function AppNavigator() {
  const { isAuthenticated, restoreSession } = useAuthStore()
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    restoreSession().finally(() => setIsReady(true))
  }, [])

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#1a7dbd" />
      </View>
    )
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="ObjectDetail" component={ObjectDetailScreen} />
            <Stack.Screen name="JournalForm" component={JournalFormScreen} />
            <Stack.Screen name="QRScanner" component={QRScannerScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
}
