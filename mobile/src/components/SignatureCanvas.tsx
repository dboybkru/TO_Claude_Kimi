import React, { useRef, useCallback } from 'react'
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native'
import { WebView } from 'react-native-webview'

interface SignatureCanvasProps {
  onSave: (base64: string) => void
  onCancel: () => void
  width?: number
  height?: number
}

const htmlContent = `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<style>
  body { margin: 0; padding: 0; overflow: hidden; background: #f8fafc; }
  canvas { display: block; touch-action: none; background: #fff; border-radius: 8px; }
</style>
</head>
<body>
<canvas id="sigCanvas"></canvas>
<script>
  const canvas = document.getElementById('sigCanvas');
  const ctx = canvas.getContext('2d');
  let drawing = false;
  let hasDrawing = false;

  function resize() {
    canvas.width = window.innerWidth - 32;
    canvas.height = window.innerHeight - 32;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#1a3a5c';
  }

  window.addEventListener('resize', resize);
  resize();

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    drawing = true;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }, { passive: false });

  canvas.addEventListener('touchmove', function(e) {
    e.preventDefault();
    if (!drawing) return;
    hasDrawing = true;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }, { passive: false });

  canvas.addEventListener('touchend', function(e) {
    e.preventDefault();
    drawing = false;
  }, { passive: false });

  canvas.addEventListener('mousedown', function(e) {
    drawing = true;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  });

  canvas.addEventListener('mousemove', function(e) {
    if (!drawing) return;
    hasDrawing = true;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  });

  canvas.addEventListener('mouseup', function() {
    drawing = false;
  });

  canvas.addEventListener('mouseleave', function() {
    drawing = false;
  });

  window.clearSignature = function() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawing = false;
  };

  window.saveSignature = function() {
    if (!hasDrawing) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'empty' }));
      return;
    }
    const dataUrl = canvas.toDataURL('image/png');
    const base64 = dataUrl.split(',')[1];
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'save', base64 }));
  };
</script>
</body>
</html>
`

export default function SignatureCanvas({ onSave, onCancel, width = 350, height = 200 }: SignatureCanvasProps) {
  const webViewRef = useRef<WebView>(null)

  const handleMessage = useCallback(
    (event: any) => {
      try {
        const data = JSON.parse(event.nativeEvent.data)
        if (data.type === 'save' && data.base64) {
          onSave(data.base64)
        } else if (data.type === 'empty') {
          // Optionally alert user that signature is empty
        }
      } catch {
        // ignore
      }
    },
    [onSave],
  )

  const clear = () => {
    webViewRef.current?.injectJavaScript('window.clearSignature(); true;')
  }

  const save = () => {
    webViewRef.current?.injectJavaScript('window.saveSignature(); true;')
  }

  return (
    <View style={[styles.container, { width, height: height + 60 }]}>
      <View style={[styles.canvasWrapper, { width, height }]}>
        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ html: htmlContent }}
          onMessage={handleMessage}
          style={[styles.webview, { width, height }]}
          scrollEnabled={false}
          javaScriptEnabled
          domStorageEnabled
        />
      </View>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.clearBtn} onPress={clear}>
          <Text style={styles.clearText}>Очистить</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
          <Text style={styles.cancelText}>Отмена</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.saveBtn} onPress={save}>
          <Text style={styles.saveText}>Сохранить</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 8,
    alignSelf: 'center',
  },
  canvasWrapper: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  webview: {
    backgroundColor: 'transparent',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 8,
  },
  clearBtn: {
    flex: 1,
    backgroundColor: '#e2e8f0',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  clearText: { color: '#64748b', fontSize: 14, fontWeight: '600' },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#cbd5e1',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelText: { color: '#475569', fontSize: 14, fontWeight: '600' },
  saveBtn: {
    flex: 1,
    backgroundColor: '#1a7dbd',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveText: { color: '#fff', fontSize: 14, fontWeight: '600' },
})
