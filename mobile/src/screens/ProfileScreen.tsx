import React from 'react'
import { View, Text, Button, StyleSheet } from 'react-native'
import { useAuthStore } from '../store/authStore'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Администратор',
  manager: 'Менеджер',
  dispatcher: 'Диспетчер',
  technician: 'Монтажник',
  customer: 'Заказчик',
  auditor: 'Аудитор',
  robot_api: 'Робот',
}

export default function ProfileScreen() {
  const { user, logout } = useAuthStore()

  return (
    <View style={styles.container}>
      <Text style={styles.name}>{user?.full_name || '—'}</Text>
      <Text style={styles.email}>{user?.email || '—'}</Text>
      <Text style={styles.role}>{ROLE_LABELS[user?.role || ''] || user?.role}</Text>

      <View style={styles.button}>
        <Button title="Выйти" onPress={logout} color="#ef4444" />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#f8fafc' },
  name: { fontSize: 24, fontWeight: 'bold', color: '#1a3a5c', marginBottom: 8 },
  email: { fontSize: 16, color: '#64748b', marginBottom: 8 },
  role: { fontSize: 14, color: '#1a7dbd', marginBottom: 32, fontWeight: '600' },
  button: { width: '100%', maxWidth: 300 },
})
