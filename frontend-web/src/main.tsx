import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider, theme } from 'antd'
import ruRU from 'antd/locale/ru_RU'
import App from './App'
import './styles/global.css'

const darkTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary:     '#1a7dbd',
    colorBgBase:      '#0f1923',
    colorBgContainer: '#0d1d2c',
    colorBgElevated:  '#0d1d2c',
    colorBgLayout:    '#0f1923',
    colorBorder:      '#162333',
    colorBorderSecondary: '#0f2033',
    colorText:        '#c5d8ea',
    colorTextSecondary: '#8aacbf',
    colorTextTertiary:  '#4d6e88',
    colorTextQuaternary: '#3d5a72',
    fontFamily:       "-apple-system, 'Segoe UI', 'Roboto', sans-serif",
    borderRadius:     8,
    colorError:  '#e85d4a',
    colorWarning: '#f0a830',
    colorSuccess: '#52c97e',
  },
  components: {
    Table: {
      headerBg:    '#091624',
      rowHoverBg:  '#0b1e30',
      borderColor: '#0f2033',
    },
    Select: {
      optionSelectedBg: '#0e2a42',
    },
    Input: {
      activeBorderColor: '#1a7dbd55',
    },
    Modal: {
      contentBg: '#0d1d2c',
      headerBg:  '#0d1d2c',
    },
    Card: {
      colorBgContainer: '#0d1d2c',
    },
  },
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider theme={darkTheme} locale={ruRU}>
      <App />
    </ConfigProvider>
  </React.StrictMode>,
)
