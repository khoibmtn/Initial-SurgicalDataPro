/**
 * AI Artifact Export & Parser Service
 * Hỗ trợ:
 * 1. Xuất kết quả AI (Bảng tổng hợp + Dữ liệu biểu đồ + Bản ghi chi tiết) ra file Excel (.xlsx)
 * 2. Xuất Biểu đồ tương tác AI ra file Ảnh (.png độ phân giải cao 2x Retina)
 * 3. Bóc tách khối artifact_json tùy chỉnh từ phản hồi của LLM (nếu có)
 */

import * as XLSX from 'xlsx';
import { AIArtifact } from '../../types/ai';

function sanitizeFileName(title: string): string {
  return (
    (title || 'Ket_qua_phan_tich_AI')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .substring(0, 60) || 'AI_Report'
  );
}

/**
 * Xuất AIArtifact ra file Excel (.xlsx) nhiều Sheet chuyên nghiệp
 */
export function exportArtifactToExcel(artifact: AIArtifact): void {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Bảng tổng hợp từ tableConfig hoặc chartConfig.data
  if (artifact.tableConfig && artifact.tableConfig.rows.length > 0) {
    const cols = artifact.tableConfig.columns;
    const formattedRows = artifact.tableConfig.rows.map((row) => {
      const out: Record<string, any> = {};
      cols.forEach((c) => {
        out[c.label] = row[c.key] ?? '';
      });
      return out;
    });

    const wsSummary = XLSX.utils.json_to_sheet(formattedRows);
    wsSummary['!cols'] = cols.map((c) => ({
      wch: Math.max(c.label.length + 5, 16),
    }));
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Bang_Tong_Hop');
  } else if (artifact.chartConfig && artifact.chartConfig.data.length > 0) {
    const wsChart = XLSX.utils.json_to_sheet(artifact.chartConfig.data);
    XLSX.utils.book_append_sheet(wb, wsChart, 'Du_Lieu_Bieu_Do');
  }

  // Sheet 2: Dữ liệu gốc chi tiết (Raw Records) nếu có
  if (artifact.rawRecords && artifact.rawRecords.length > 0) {
    const wsRaw = XLSX.utils.json_to_sheet(artifact.rawRecords);
    const firstRowKeys = Object.keys(artifact.rawRecords[0] || {});
    wsRaw['!cols'] = firstRowKeys.map((k) => ({
      wch: Math.max(k.length + 6, 16),
    }));
    XLSX.utils.book_append_sheet(wb, wsRaw, 'Chi_Tiet_Ban_Ghi');
  }

  // Sheet 3: Thông tin KPI & Mô tả truy vấn
  const metaRows: Array<Record<string, any>> = [
    { 'Hạng mục': 'Tiêu đề báo cáo', 'Giá trị': artifact.title },
    { 'Hạng mục': 'Mô tả phụ', 'Giá trị': artifact.subtitle || '' },
    { 'Hạng mục': 'Truy vấn liên kết', 'Giá trị': artifact.querySummary || 'Tự động liên kết đa bảng' },
    { 'Hạng mục': 'Thời điểm kết xuất', 'Giá trị': new Date().toLocaleString('vi-VN') },
  ];
  (artifact.kpiCards || []).forEach((kpi) => {
    metaRows.push({
      'Hạng mục': `Chỉ số: ${kpi.label}`,
      'Giá trị': kpi.value,
    });
  });

  const wsMeta = XLSX.utils.json_to_sheet(metaRows);
  wsMeta['!cols'] = [{ wch: 30 }, { wch: 65 }];
  XLSX.utils.book_append_sheet(wb, wsMeta, 'Thong_Tin_Chung');

  const fileName = `${sanitizeFileName(artifact.title)}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

/**
 * Xuất biểu đồ SVG trong container ra file ảnh PNG sắc nét (2x Retina)
 * bao gồm cả Tiêu đề, Phụ đề và Chú giải màu sắc (Legend)
 */
export async function exportChartContainerToPng(
  containerEl: HTMLElement | null,
  artifact: AIArtifact
): Promise<void> {
  if (!containerEl) return;
  const svgEl = containerEl.querySelector('svg');
  if (!svgEl) {
    throw new Error('Không tìm thấy biểu đồ SVG để xuất ảnh.');
  }

  const bbox = svgEl.getBoundingClientRect();
  const width = Math.max(Math.round(bbox.width), 800);
  const svgHeight = Math.max(Math.round(bbox.height), 360);
  const headerHeight = 110;
  const footerHeight = 44;
  const totalHeight = svgHeight + headerHeight + footerHeight;
  const scale = 2; // 2x Retina DPI

  // Clone SVG and inline computed styles for text/axis elements
  const clonedSvg = svgEl.cloneNode(true) as SVGSVGElement;
  clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clonedSvg.setAttribute('width', String(width));
  clonedSvg.setAttribute('height', String(svgHeight));

  const svgData = new XMLSerializer().serializeToString(clonedSvg);
  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = (e) => reject(e);
      image.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = totalHeight * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Không thể khởi tạo Canvas 2D.');

    ctx.scale(scale, scale);

    // 1. Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, totalHeight);

    // 2. Header bar
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 17px Inter, system-ui, -apple-system, sans-serif';
    ctx.fillText(artifact.title || 'Biểu đồ Phân tích AI', 24, 34);

    if (artifact.subtitle) {
      ctx.fillStyle = '#475569';
      ctx.font = '12px Inter, system-ui, -apple-system, sans-serif';
      ctx.fillText(artifact.subtitle.slice(0, 120), 24, 56);
    }

    // 3. Draw Series Legend in Header
    const series = artifact.chartConfig?.series || [];
    let legendX = 24;
    const legendY = 82;
    ctx.font = '600 12px Inter, system-ui, -apple-system, sans-serif';
    series.forEach((s) => {
      ctx.fillStyle = s.color || '#0284c7';
      ctx.fillRect(legendX, legendY - 10, 12, 12);
      ctx.fillStyle = '#1e293b';
      ctx.fillText(s.name, legendX + 18, legendY);
      legendX += ctx.measureText(s.name).width + 38;
    });

    // 4. Draw SVG Chart
    ctx.drawImage(img, 0, headerHeight, width, svgHeight);

    // 5. Footer watermark
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(24, totalHeight - 32);
    ctx.lineTo(width - 24, totalHeight - 32);
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = '11px Inter, system-ui, -apple-system, sans-serif';
    ctx.fillText(
      `Kết xuất từ SurgicalDataPro AI Analytics • ${new Date().toLocaleString('vi-VN')}`,
      24,
      totalHeight - 14
    );

    const pngUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = pngUrl;
    a.download = `${sanitizeFileName(artifact.title)}_${new Date().toISOString().slice(0, 10)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Tách các khối ```artifact_json ... ``` tùy chỉnh nếu LLM tự sinh thêm
 */
export function parseCustomArtifactsFromLLMText(rawText: string): {
  cleanText: string;
  customArtifacts: AIArtifact[];
} {
  const customArtifacts: AIArtifact[] = [];
  if (!rawText) return { cleanText: '', customArtifacts };

  const regex = /```artifact_json\s*([\s\S]*?)```/gi;
  const cleanText = rawText.replace(regex, (_, jsonContent) => {
    try {
      const parsed = JSON.parse(jsonContent.trim());
      if (parsed && (parsed.chartConfig || parsed.tableConfig)) {
        customArtifacts.push({
          id: parsed.id || `llm_artifact_${Date.now()}_${customArtifacts.length}`,
          type: parsed.type || 'composite',
          title: parsed.title || 'Biểu đồ Phân tích AI',
          subtitle: parsed.subtitle,
          kpiCards: parsed.kpiCards,
          chartConfig: parsed.chartConfig,
          tableConfig: parsed.tableConfig,
          createdAt: Date.now(),
        });
      }
    } catch (e) {
      console.warn('[aiArtifactExportService] Could not parse artifact_json block:', e);
    }
    return '';
  });

  return {
    cleanText: cleanText.trim(),
    customArtifacts,
  };
}
