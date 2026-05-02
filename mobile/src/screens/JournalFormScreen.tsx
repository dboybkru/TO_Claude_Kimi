import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Switch,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ScrollView,
  Image,
  Modal,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import { journalsApi } from '../api/services'
import { CreateJournalDto } from '../types'
import SignatureCanvas from '../components/SignatureCanvas'

export default function JournalFormScreen({ route, navigation }: any) {
  const { objectId } = route.params || {}
  const [arrivedAt, setArrivedAt] = useState(new Date().toISOString())
  const [osChecked, setOsChecked] = useState(false)
  const [skudChecked, setSkudChecked] = useState(false)
  const [description, setDescription] = useState('')
  const [systemStatus, setSystemStatus] = useState<'operational' | 'needs_repair' | 'repaired'>('operational')
  const [customerRepName, setCustomerRepName] = useState('')
  const [technicianSignature, setTechnicianSignature] = useState<string | null>(null)
  const [customerSignature, setCustomerSignature] = useState<string | null>(null)
  const [photos, setPhotos] = useState<string[]>([])
  const [showTechSignature, setShowTechSignature] = useState(false)
  const [showCustSignature, setShowCustSignature] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSave = async () => {
    if (!objectId) {
      Alert.alert('Ошибка', 'Не указан объект')
      return
    }
    const checklist: string[] = []
    if (osChecked) checklist.push('ОС проверена')
    if (skudChecked) checklist.push('СКУД проверена')

    const data: CreateJournalDto = {
      object_id: objectId,
      checklist,
      result_description: description,
      system_status: systemStatus,
      customer_rep_name: customerRepName || undefined,
      technician_signature: technicianSignature || undefined,
      customer_signature: customerSignature || undefined,
      photos: photos.length > 0 ? photos : undefined,
    }

    setLoading(true)
    try {
      await journalsApi.create(data)
      Alert.alert('Успех', 'Журнал ТО создан')
      navigation.goBack()
    } catch {
      Alert.alert('Ошибка', 'Не удалось создать журнал')
    } finally {
      setLoading(false)
    }
  }

  const pickPhoto = async (fromCamera: boolean) => {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync()

    if (!permission.granted) {
      Alert.alert('Ошибка', 'Нет разрешения на доступ к фото')
      return
    }

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          allowsEditing: false,
          quality: 0.9,
          base64: true,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: false,
          quality: 0.9,
          base64: true,
        })

    if (result.canceled || !result.assets || result.assets.length === 0) return

    const asset = result.assets[0]
    const uri = asset.uri

    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      )

      if (manipulated.base64) {
        setPhotos((prev) => [...prev, `data:image/jpeg;base64,${manipulated.base64}`])
      }
    } catch {
      Alert.alert('Ошибка', 'Не удалось обработать фото')
    }
  }

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index))
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.title}>Журнал ТО</Text>

      <View style={styles.field}>
        <Text style={styles.label}>Время прибытия</Text>
        <TextInput style={styles.input} value={arrivedAt} onChangeText={setArrivedAt} />
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>ОС проверена</Text>
        <Switch value={osChecked} onValueChange={setOsChecked} />
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>СКУД проверена</Text>
        <Switch value={skudChecked} onValueChange={setSkudChecked} />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Описание работ</Text>
        <TextInput
          style={[styles.input, { height: 80 }]}
          multiline
          value={description}
          onChangeText={setDescription}
          placeholder="Описание выполненных работ"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Статус системы</Text>
        <View style={styles.statusRow}>
          {(['operational', 'repaired', 'needs_repair'] as const).map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.statusBtn, systemStatus === s && styles.statusBtnActive]}
              onPress={() => setSystemStatus(s)}
            >
              <Text style={[styles.statusText, systemStatus === s && styles.statusTextActive]}>
                {s === 'operational' ? 'Работает' : s === 'repaired' ? 'Отремонтирована' : 'Требует ремонта'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Представитель заказчика</Text>
        <TextInput
          style={styles.input}
          value={customerRepName}
          onChangeText={setCustomerRepName}
          placeholder="ФИО представителя"
        />
      </View>

      {/* Technician Signature */}
      <View style={styles.field}>
        <Text style={styles.label}>Подпись техника</Text>
        {technicianSignature ? (
          <View style={styles.signaturePreview}>
            <Image source={{ uri: `data:image/png;base64,${technicianSignature}` }} style={styles.signatureImage} />
            <TouchableOpacity onPress={() => setShowTechSignature(true)}>
              <Text style={styles.linkText}>Изменить подпись</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowTechSignature(true)}>
            <Text style={styles.addBtnText}>Добавить подпись техника</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Customer Signature */}
      <View style={styles.field}>
        <Text style={styles.label}>Подпись заказчика</Text>
        {customerSignature ? (
          <View style={styles.signaturePreview}>
            <Image source={{ uri: `data:image/png;base64,${customerSignature}` }} style={styles.signatureImage} />
            <TouchableOpacity onPress={() => setShowCustSignature(true)}>
              <Text style={styles.linkText}>Изменить подпись</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowCustSignature(true)}>
            <Text style={styles.addBtnText}>Добавить подпись заказчика</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Photos */}
      <View style={styles.field}>
        <Text style={styles.label}>Фото</Text>
        <View style={styles.photoActions}>
          <TouchableOpacity style={styles.photoBtn} onPress={() => pickPhoto(false)}>
            <Text style={styles.photoBtnText}>Галерея</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.photoBtn} onPress={() => pickPhoto(true)}>
            <Text style={styles.photoBtnText}>Камера</Text>
          </TouchableOpacity>
        </View>
        {photos.length > 0 && (
          <ScrollView horizontal style={styles.photoScroll} contentContainerStyle={{ gap: 8 }}>
            {photos.map((photo, index) => (
              <View key={index} style={styles.photoWrapper}>
                <Image source={{ uri: photo }} style={styles.photoThumb} />
                <TouchableOpacity style={styles.removePhotoBtn} onPress={() => removePhoto(index)}>
                  <Text style={styles.removePhotoText}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.cancelText}>Отмена</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={loading}>
          <Text style={styles.saveText}>{loading ? 'Сохранение...' : 'Сохранить'}</Text>
        </TouchableOpacity>
      </View>

      {/* Modals */}
      <Modal visible={showTechSignature} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Подпись техника</Text>
            <SignatureCanvas
              onSave={(base64) => {
                setTechnicianSignature(base64)
                setShowTechSignature(false)
              }}
              onCancel={() => setShowTechSignature(false)}
            />
          </View>
        </View>
      </Modal>

      <Modal visible={showCustSignature} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Подпись заказчика</Text>
            <SignatureCanvas
              onSave={(base64) => {
                setCustomerSignature(base64)
                setShowCustSignature(false)
              }}
              onCancel={() => setShowCustSignature(false)}
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#1a3a5c', marginBottom: 20 },
  field: { marginBottom: 16 },
  label: { fontSize: 13, color: '#64748b', marginBottom: 6 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    fontSize: 16,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  statusRow: { flexDirection: 'row', gap: 8 },
  statusBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#e2e8f0',
  },
  statusBtnActive: { backgroundColor: '#1a7dbd' },
  statusText: { fontSize: 13, color: '#64748b' },
  statusTextActive: { color: '#fff' },
  addBtn: {
    backgroundColor: '#e2e8f0',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  addBtnText: { color: '#1a3a5c', fontSize: 14, fontWeight: '600' },
  signaturePreview: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 8,
    alignItems: 'center',
  },
  signatureImage: { width: 200, height: 100, resizeMode: 'contain', backgroundColor: '#fff' },
  linkText: { color: '#1a7dbd', marginTop: 6, fontSize: 13, fontWeight: '600' },
  photoActions: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  photoBtn: {
    flex: 1,
    backgroundColor: '#1a7dbd',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  photoBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  photoScroll: { flexGrow: 0 },
  photoWrapper: { position: 'relative' },
  photoThumb: { width: 100, height: 100, borderRadius: 8, backgroundColor: '#e2e8f0' },
  removePhotoBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#ef4444',
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removePhotoText: { color: '#fff', fontSize: 16, fontWeight: 'bold', lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  cancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
  },
  cancelText: { color: '#64748b', fontSize: 16, fontWeight: '600' },
  saveBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#1a7dbd',
    alignItems: 'center',
  },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    width: '100%',
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1a3a5c', marginBottom: 12 },
})
