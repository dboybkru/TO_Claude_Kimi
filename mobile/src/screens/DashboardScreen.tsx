import React, { useCallback, useState } from 'react'
import { View, Text, FlatList, RefreshControl, StyleSheet, TouchableOpacity } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { ObjectItem } from '../types'
import { useAuthStore } from '../store/authStore'
import { useOfflineStore } from '../store/offlineStore'

export default function DashboardScreen({ navigation }: any) {
  const [objects, setObjects] = useState<ObjectItem[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const { user } = useAuthStore()
  const { isOffline, syncObjects } = useOfflineStore()

  const loadObjects = useCallback(async () => {
    const params: Record<string, unknown> = { status: 'active' }
    if (user?.role === 'technician') {
      params.responsible_technician_id = user.id
    }
    const items = await syncObjects(params)
    setObjects(items)
  }, [user, syncObjects])

  useFocusEffect(
    useCallback(() => {
      loadObjects()
    }, [loadObjects]),
  )

  const onRefresh = async () => {
    setRefreshing(true)
    await loadObjects()
    setRefreshing(false)
  }

  const renderItem = ({ item }: { item: ObjectItem }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('ObjectDetail', { id: item.id })}
    >
      <Text style={styles.cardTitle}>{item.name}</Text>
      <Text style={styles.cardAddress}>{item.address}</Text>
      <Text style={styles.cardStatus}>Статус: {item.status}</Text>
    </TouchableOpacity>
  )

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Объекты на сегодня</Text>
        {isOffline && (
          <View style={styles.offlineBadge}>
            <Text style={styles.offlineText}>Офлайн режим</Text>
          </View>
        )}
      </View>
      <TouchableOpacity
        style={styles.qrBtn}
        onPress={() => navigation.navigate('QRScanner')}
      >
        <Text style={styles.qrBtnText}>Сканировать QR</Text>
      </TouchableOpacity>
      <FlatList
        data={objects}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={
          <Text style={styles.empty}>Нет объектов на сегодня</Text>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  header: { fontSize: 20, fontWeight: 'bold', color: '#1a3a5c' },
  offlineBadge: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  offlineText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  qrBtn: {
    backgroundColor: '#1a7dbd',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  qrBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#1a3a5c', marginBottom: 4 },
  cardAddress: { fontSize: 13, color: '#64748b', marginBottom: 4 },
  cardStatus: { fontSize: 12, color: '#1a7dbd' },
  empty: { textAlign: 'center', marginTop: 40, color: '#94a3b8', fontSize: 16 },
})
