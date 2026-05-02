import React, { useState, useCallback } from 'react'
import { View, Text, FlatList, TextInput, RefreshControl, StyleSheet, TouchableOpacity } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { ObjectItem } from '../types'
import { useOfflineStore } from '../store/offlineStore'

export default function ObjectsScreen({ navigation }: any) {
  const [objects, setObjects] = useState<ObjectItem[]>([])
  const [query, setQuery] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const { isOffline, syncObjects } = useOfflineStore()

  const loadObjects = useCallback(async () => {
    const items = await syncObjects()
    setObjects(items)
  }, [syncObjects])

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

  const filtered = query.trim()
    ? objects.filter(
        (o) =>
          o.name.toLowerCase().includes(query.toLowerCase()) ||
          o.address.toLowerCase().includes(query.toLowerCase()),
      )
    : objects

  const renderItem = ({ item }: { item: ObjectItem }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('ObjectDetail', { id: item.id })}
    >
      <Text style={styles.cardTitle}>{item.name}</Text>
      <Text style={styles.cardAddress}>{item.address}</Text>
    </TouchableOpacity>
  )

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <TextInput
          style={styles.search}
          placeholder="Поиск по адресу или названию"
          value={query}
          onChangeText={setQuery}
        />
        <TouchableOpacity
          style={styles.qrBtn}
          onPress={() => navigation.navigate('QRScanner')}
        >
          <Text style={styles.qrBtnText}>QR</Text>
        </TouchableOpacity>
      </View>
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>Офлайн режим — показаны кэшированные данные</Text>
        </View>
      )}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={
          <Text style={styles.empty}>Объекты не найдены</Text>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 8,
  },
  search: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  qrBtn: {
    backgroundColor: '#1a7dbd',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  offlineBanner: {
    backgroundColor: '#f59e0b',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  offlineBannerText: { color: '#fff', fontSize: 12, fontWeight: '600' },
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
  cardAddress: { fontSize: 13, color: '#64748b' },
  empty: { textAlign: 'center', marginTop: 40, color: '#94a3b8', fontSize: 16 },
})
