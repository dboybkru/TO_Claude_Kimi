import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native'
import { objectsApi } from '../api/services'
import { ObjectItem } from '../types'

export default function ObjectDetailScreen({ route, navigation }: any) {
  const { id } = route.params
  const [object, setObject] = useState<ObjectItem | null>(null)

  useEffect(() => {
    objectsApi.get(id).then((res) => setObject(res.data)).catch(() => setObject(null))
  }, [id])

  if (!object) {
    return (
      <View style={styles.center}>
        <Text>Загрузка...</Text>
      </View>
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.title}>{object.name}</Text>
      <Text style={styles.address}>{object.address}</Text>

      <View style={styles.section}>
        <Text style={styles.label}>Тип системы</Text>
        <Text style={styles.value}>{object.system_type || '—'}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Контакт</Text>
        <Text style={styles.value}>{object.contact_person || '—'}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Телефон</Text>
        <Text style={styles.value}>{object.contact_phone || '—'}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Последнее ТО</Text>
        <Text style={styles.value}>
          {object.last_maintenance_at
            ? new Date(object.last_maintenance_at).toLocaleDateString('ru-RU')
            : '—'}
        </Text>
      </View>

      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.navigate('JournalForm', { objectId: object.id })}
      >
        <Text style={styles.buttonText}>Создать журнал ТО</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#1a3a5c', marginBottom: 8 },
  address: { fontSize: 14, color: '#64748b', marginBottom: 24 },
  section: { marginBottom: 16 },
  label: { fontSize: 12, color: '#94a3b8', marginBottom: 4 },
  value: { fontSize: 16, color: '#1a3a5c' },
  button: {
    backgroundColor: '#1a7dbd',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
})
