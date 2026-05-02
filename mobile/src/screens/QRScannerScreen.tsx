import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native'
import { BarCodeScanner } from 'expo-barcode-scanner'

export default function QRScannerScreen({ navigation }: any) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const [scanned, setScanned] = useState(false)

  useEffect(() => {
    ;(async () => {
      const { status } = await BarCodeScanner.requestPermissionsAsync()
      setHasPermission(status === 'granted')
    })()
  }, [])

  const handleBarCodeScanned = ({ type, data }: { type: string; data: string }) => {
    if (scanned) return
    setScanned(true)

    let objectId: string | null = null
    try {
      const parsed = JSON.parse(data)
      if (parsed && parsed.object_id) {
        objectId = parsed.object_id
      }
    } catch {
      // If not JSON, treat raw data as object_id if it looks like an ID
      if (data && data.trim().length > 0) {
        objectId = data.trim()
      }
    }

    if (objectId) {
      navigation.replace('ObjectDetail', { id: objectId })
    } else {
      Alert.alert('Ошибка', 'QR-код не содержит object_id')
      setScanned(false)
    }
  }

  if (hasPermission === null) {
    return (
      <View style={styles.center}>
        <Text>Запрос разрешения на использование камеры...</Text>
      </View>
    )
  }

  if (hasPermission === false) {
    return (
      <View style={styles.center}>
        <Text>Нет доступа к камере</Text>
        <TouchableOpacity style={styles.btn} onPress={() => navigation.goBack()}>
          <Text style={styles.btnText}>Назад</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <BarCodeScanner
        onBarCodeScanned={scanned ? undefined : handleBarCodeScanned}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.overlay}>
        <View style={styles.scanArea} />
      </View>
      <View style={styles.bottomControls}>
        {scanned && (
          <TouchableOpacity style={styles.btn} onPress={() => setScanned(false)}>
            <Text style={styles.btnText}>Сканировать снова</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.btn, styles.cancelBtn]} onPress={() => navigation.goBack()}>
          <Text style={styles.cancelText}>Отмена</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanArea: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: '#1a7dbd',
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  bottomControls: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 12,
  },
  btn: {
    backgroundColor: '#1a7dbd',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginBottom: 8,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cancelBtn: { backgroundColor: '#e2e8f0' },
  cancelText: { color: '#64748b', fontSize: 16, fontWeight: '600' },
})
