/**
 * Печатные формы по Договору №10944505 ПАО «Ростелеком» / ООО «ФОРТУНА»
 *
 * Приложение №2 к ТЗ — Журнал технического обслуживания (хранится на объекте)
 * Приложение №4 к ТЗ — Сводный журнал технического обслуживания (хранится у исполнителя)
 * Приложение №5 к ТЗ — Акт технической оснащённости объекта
 */

const CONTRACT_INFO = {
  number: '10944505',
  customer: 'ПАО «Ростелеком»',
  executor: 'ООО «ФОРТУНА»',
};

const PRINT_CSS = `
  @page { margin: 15mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Times New Roman', serif; font-size: 11pt; color: #000; margin: 0; }
  h1 { font-size: 14pt; text-align: center; margin: 0 0 4px; }
  h2 { font-size: 12pt; text-align: center; margin: 0 0 8px; font-weight: normal; }
  .meta { text-align: center; margin-bottom: 12px; font-size: 10pt; }
  .notice { border: 1px solid #000; padding: 6px 10px; margin-bottom: 12px; font-size: 10pt; text-align: center; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th, td { border: 1px solid #000; padding: 4px 6px; vertical-align: top; font-size: 10pt; }
  th { background: #f0f0f0; text-align: center; font-weight: bold; }
  td.center { text-align: center; }
  .signatures { margin-top: 20px; display: flex; justify-content: space-between; font-size: 10pt; }
  .sig-block { width: 45%; }
  .sig-line { border-bottom: 1px solid #000; margin: 4px 0 2px; height: 18px; }
  .page-break { page-break-before: always; }
  .blank-rows td { height: 28px; }
  @media print {
    .no-print { display: none !important; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

function openPrintWindow(html: string, title: string) {
  const w = window.open('', '_blank');
  if (!w) {
    alert('Разрешите всплывающие окна для печати');
    return;
  }
  w.document.write(`<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>${PRINT_CSS}</style>
</head>
<body>
${html}
<div class="no-print" style="margin-top:20px; text-align:center;">
  <button onclick="window.print()" style="padding:8px 24px;font-size:14px;cursor:pointer;">🖨 Печать</button>
  <button onclick="window.close()" style="padding:8px 24px;font-size:14px;cursor:pointer;margin-left:12px;">✕ Закрыть</button>
</div>
</body>
</html>`);
  w.document.close();
}

/* ─────────────────────────────────────────────────────────────
   Приложение №2 к ТЗ — Журнал ТО (заполненный, данные из БД)
   Столбцы: №п/п | Дата ТП/ТО | Тип системы, описание неисправности |
            Результат | Отметка исполнителя | Отметка заказчика
   ───────────────────────────────────────────────────────────── */

export interface JournalEntry {
  num: number;
  journal_number: number | null;
  arrived_at: string | null;
  completed_at: string | null;
  system_type: string;
  result_description: string;
  final_statement: string;
  technician_name: string;
  technician_signature: string;
  customer_rep_name: string;
  customer_signature: string;
}

export interface ObjectInfo {
  id: string;
  name: string;
  address: string;
  type: string;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/**
 * Печать Журнала ТО для конкретного объекта (Приложение №2 к ТЗ).
 * Данные берутся из БД — для распечатки хранящейся истории.
 */
export function printObjectJournal(object: ObjectInfo, entries: JournalEntry[]) {
  const rows = entries.map((e) => `
    <tr>
      <td class="center">${e.journal_number ?? e.num}</td>
      <td class="center">${formatDate(e.completed_at || e.arrived_at)}</td>
      <td>${e.system_type || '—'}</td>
      <td>${e.result_description || ''}${e.final_statement ? `<br><em>${e.final_statement}</em>` : ''}</td>
      <td>${e.technician_name || ''}<br>${e.technician_signature ? `<img src="${e.technician_signature}" style="max-height:32px">` : ''}</td>
      <td>${e.customer_rep_name || ''}</td>
    </tr>
  `).join('');

  const html = `
    <h1>Журнал технического обслуживания</h1>
    <h2>Приложение №2 к Техническому заданию</h2>
    <div class="meta">Договор №${CONTRACT_INFO.number} | ${CONTRACT_INFO.customer} / ${CONTRACT_INFO.executor}</div>
    <div class="notice">Журнал хранится на объекте. Вынос журнала за пределы объекта ЗАПРЕЩЕН.</div>
    <table style="margin-bottom:12px; width:60%">
      <tr><td style="width:40%"><b>Объект:</b></td><td>${object.name}</td></tr>
      <tr><td><b>Адрес:</b></td><td>${object.address}</td></tr>
      <tr><td><b>Тип системы:</b></td><td>${object.type}</td></tr>
    </table>
    <table>
      <thead>
        <tr>
          <th style="width:5%">№ п/п</th>
          <th style="width:12%">Дата проведения ТП/ТО</th>
          <th style="width:22%">Тип системы, описание неисправности</th>
          <th style="width:25%">Результат выполненных работ</th>
          <th style="width:18%">Отметка Исполнителя (ФИО, подпись, дата)</th>
          <th style="width:18%">Отметка заказчика о контроле</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="6" class="center">Записей нет</td></tr>'}
      </tbody>
    </table>
  `;

  openPrintWindow(html, `Журнал ТО — ${object.name}`);
}

/* ─────────────────────────────────────────────────────────────
   Приложение №2 — ПУСТОЙ ШАБЛОН для распечатки и раздачи
   на все 313 объектов в первый месяц обслуживания
   ───────────────────────────────────────────────────────────── */

const BLANK_ROWS_COUNT = 40; // строк в одном бланке

function makeBlankRows(count: number): string {
  return Array.from({ length: count })
    .map((_, i) => `
      <tr class="blank-rows">
        <td class="center">${i + 1}</td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
      </tr>
    `)
    .join('');
}

/**
 * Печать пустого бланка Журнала ТО для физического размещения на объекте.
 * Может включать сразу несколько объектов — по одной странице на объект.
 */
export function printBlankJournals(objects: ObjectInfo[]) {
  const pages = objects.map((obj, idx) => `
    ${idx > 0 ? '<div class="page-break"></div>' : ''}
    <h1>Журнал технического обслуживания</h1>
    <h2>Приложение №2 к Техническому заданию</h2>
    <div class="meta">Договор №${CONTRACT_INFO.number} | ${CONTRACT_INFO.customer} / ${CONTRACT_INFO.executor}</div>
    <div class="notice">Журнал хранится на объекте. Вынос журнала за пределы объекта ЗАПРЕЩЕН.</div>
    <table style="margin-bottom:12px; width:60%">
      <tr><td style="width:40%"><b>Объект:</b></td><td>${obj.name}</td></tr>
      <tr><td><b>Адрес:</b></td><td>${obj.address}</td></tr>
      <tr><td><b>Тип системы:</b></td><td>${obj.type}</td></tr>
    </table>
    <table>
      <thead>
        <tr>
          <th style="width:5%">№ п/п</th>
          <th style="width:12%">Дата проведения ТП/ТО</th>
          <th style="width:22%">Тип системы, описание неисправности</th>
          <th style="width:25%">Результат выполненных работ</th>
          <th style="width:18%">Отметка Исполнителя (ФИО, подпись, дата)</th>
          <th style="width:18%">Отметка заказчика о контроле</th>
        </tr>
      </thead>
      <tbody>
        ${makeBlankRows(BLANK_ROWS_COUNT)}
      </tbody>
    </table>
  `).join('');

  openPrintWindow(pages, 'Журналы ТО — бланки для объектов');
}

/* ─────────────────────────────────────────────────────────────
   Приложение №4 к ТЗ — Сводный журнал ТО (у исполнителя)
   Столбцы: №п/п | Дата ТО | Наим. и адрес объекта |
            Тип системы/неисправность | Результат |
            Дата/время выполнения заявки | Отметка исполнителя | Отметка заказчика
   ───────────────────────────────────────────────────────────── */

export interface SummaryEntry {
  num: number;
  journal_number: number | null;
  completed_at: string | null;
  arrived_at: string | null;
  object_name: string;
  object_address: string;
  system_type: string;
  result_description: string;
  final_statement: string;
  technician_name: string;
  technician_signature: string;
  customer_rep_name: string;
  customer_signature: string;
}

export function printSummaryJournal(
  entries: SummaryEntry[],
  period?: { from?: string; to?: string },
) {
  const periodLabel = period?.from || period?.to
    ? `Период: ${period.from ? formatDate(period.from) : '—'} — ${period.to ? formatDate(period.to) : '—'}`
    : 'Весь период';

  const rows = entries.map((e) => `
    <tr>
      <td class="center">${e.num}</td>
      <td class="center">${formatDate(e.completed_at)}</td>
      <td>${e.object_name}<br><small>${e.object_address}</small></td>
      <td>${e.system_type || '—'}</td>
      <td>${e.result_description || ''}${e.final_statement ? `<br><em>${e.final_statement}</em>` : ''}</td>
      <td class="center">${formatDateTime(e.arrived_at)}</td>
      <td>${e.technician_name}<br>${e.technician_signature ? `<img src="${e.technician_signature}" style="max-height:28px">` : ''}</td>
      <td>${e.customer_rep_name || ''}</td>
    </tr>
  `).join('');

  const html = `
    <style>
      @page { size: A4 landscape; margin: 12mm; }
      body { font-size: 9pt; }
      th, td { font-size: 9pt; padding: 3px 5px; }
    </style>
    <h1>Сводный журнал технического обслуживания</h1>
    <h2>Приложение №4 к Техническому заданию</h2>
    <div class="meta">
      Договор №${CONTRACT_INFO.number} | ${CONTRACT_INFO.customer} / ${CONTRACT_INFO.executor}<br>
      ${periodLabel} | Записей: ${entries.length}
    </div>
    <table>
      <thead>
        <tr>
          <th style="width:4%">№ п/п</th>
          <th style="width:8%">Дата проведения ТО</th>
          <th style="width:18%">Наименование и адрес объекта</th>
          <th style="width:14%">Тип системы / описание неисправности</th>
          <th style="width:20%">Результат выполненных работ</th>
          <th style="width:10%">Дата и время выполнения заявки</th>
          <th style="width:13%">Отметка исполнителя (ФИО, подпись, дата)</th>
          <th style="width:13%">Отметка заказчика о контроле</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="8" class="center">Нет данных за выбранный период</td></tr>'}
      </tbody>
    </table>
    <div class="signatures">
      <div class="sig-block">
        <b>Исполнитель:</b> ${CONTRACT_INFO.executor}<br>
        <div class="sig-line"></div>
        <small>подпись / дата</small>
      </div>
      <div class="sig-block">
        <b>Заказчик:</b> ${CONTRACT_INFO.customer}<br>
        <div class="sig-line"></div>
        <small>подпись / дата</small>
      </div>
    </div>
  `;

  openPrintWindow(html, 'Сводный журнал ТО — Приложение №4');
}

/* ─────────────────────────────────────────────────────────────
   Приложение №5 к ТЗ — Акт технической оснащённости объекта
   Столбцы: №п/п | Наименование объекта | Наименование оборудования |
            Количество единиц оборудования
   ───────────────────────────────────────────────────────────── */

export interface EquipmentItem {
  name: string;
  quantity: number;
}

export interface ObjectEquipment {
  object_name: string;
  object_address: string;
  type: string;
  equipment: EquipmentItem[];
}

/**
 * Печать Акта технической оснащённости для одного или нескольких объектов.
 * Каждый объект — отдельная секция таблицы (или страница, если много объектов).
 */
export function printEquipmentAct(objects: ObjectEquipment[], dateStr?: string) {
  const today = dateStr || new Date().toLocaleDateString('ru-RU');
  let globalNum = 1;

  const rows = objects.flatMap((obj) =>
    obj.equipment.length > 0
      ? obj.equipment.map((eq, i) => `
          <tr>
            <td class="center">${i === 0 ? globalNum++ : ''}</td>
            <td>${i === 0 ? `${obj.object_name}<br><small>${obj.object_address}</small>` : ''}</td>
            <td>${eq.name}</td>
            <td class="center">${eq.quantity}</td>
          </tr>
        `)
      : [`
          <tr>
            <td class="center">${globalNum++}</td>
            <td>${obj.object_name}<br><small>${obj.object_address}</small></td>
            <td>—</td>
            <td class="center">—</td>
          </tr>
        `],
  ).join('');

  const html = `
    <h1>Акт технической оснащённости объекта</h1>
    <h2>Приложение №5 к Техническому заданию</h2>
    <div class="meta">
      Договор №${CONTRACT_INFO.number} | ${CONTRACT_INFO.customer} / ${CONTRACT_INFO.executor}<br>
      Дата составления: ${today} | Объектов: ${objects.length}
    </div>
    <table>
      <thead>
        <tr>
          <th style="width:5%">№ п/п</th>
          <th style="width:35%">Наименование объекта</th>
          <th style="width:45%">Наименование оборудования</th>
          <th style="width:15%">Количество единиц</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="4" class="center">Нет данных</td></tr>'}
      </tbody>
    </table>
    <div class="signatures" style="margin-top:30px;">
      <div class="sig-block">
        <b>Представитель Исполнителя:</b><br>
        ${CONTRACT_INFO.executor}<br>
        <div class="sig-line"></div>
        <small>ФИО / подпись / дата</small>
      </div>
      <div class="sig-block">
        <b>Представитель Заказчика:</b><br>
        ${CONTRACT_INFO.customer}<br>
        <div class="sig-line"></div>
        <small>ФИО / подпись / дата</small>
      </div>
    </div>
  `;

  openPrintWindow(html, 'Акт технической оснащённости — Приложение №5');
}
