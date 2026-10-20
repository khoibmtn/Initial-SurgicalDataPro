import React, { useState, useRef, useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  LineChart,
  AreaChart,
  PieChart,
  Pie,
  Cell,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  Brush,
} from 'recharts';
import {
  BarChart3,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  Layers,
  ImageDown,
  FileSpreadsheet,
  SlidersHorizontal,
  RotateCcw,
  Eye,
} from 'lucide-react';
import { AIArtifact, AIChartType } from '../../types/ai';
import {
  exportArtifactToExcel,
  exportChartContainerToPng,
} from '../../services/ai/aiArtifactExportService';

interface AIInteractiveChartArtifactProps {
  artifact: AIArtifact;
  height?: number;
}

const PIE_COLORS = [
  '#0284c7',
  '#10b981',
  '#f59e0b',
  '#0d9488',
  '#ea580c',
  '#2563eb',
  '#059669',
  '#d97706',
  '#475569',
];

export const AIInteractiveChartArtifact: React.FC<AIInteractiveChartArtifactProps> = ({
  artifact,
  height = 340,
}) => {
  const chartConfig = artifact.chartConfig;
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const [chartType, setChartType] = useState<AIChartType>(
    chartConfig?.chartType || 'composed'
  );
  const [isStacked, setIsStacked] = useState<boolean>(Boolean(chartConfig?.stacked));
  const [hiddenSeriesKeys, setHiddenSeriesKeys] = useState<Record<string, boolean>>({});
  const [brushRange, setBrushRange] = useState<{ startIndex: number; endIndex: number }>(() => ({
    startIndex: 0,
    endIndex: Math.max(0, (chartConfig?.data?.length || 1) - 1),
  }));
  const [selectedPoint, setSelectedPoint] = useState<Record<string, any> | null>(null);
  const [exportingPng, setExportingPng] = useState(false);

  const data = chartConfig?.data || [];
  const series = chartConfig?.series || [];
  const xAxisKey = chartConfig?.xAxisKey || 'name';

  // Slice data according to interactive brush range for dynamic stats calculation
  const activeSliceData = useMemo(() => {
    if (data.length === 0) return [];
    const start = Math.max(0, Math.min(brushRange.startIndex, data.length - 1));
    const end = Math.max(start, Math.min(brushRange.endIndex, data.length - 1));
    return data.slice(start, end + 1);
  }, [data, brushRange]);

  const sliceTotals = useMemo(() => {
    return series.map((s) => {
      const sum = activeSliceData.reduce(
        (acc, row) => acc + (Number(row[s.key]) || 0),
        0
      );
      return {
        key: s.key,
        name: s.name,
        color: s.color,
        sum: Math.round(sum * 100) / 100,
      };
    });
  }, [series, activeSliceData]);

  if (!chartConfig || data.length === 0) return null;

  const visibleSeries = series.filter((s) => !hiddenSeriesKeys[s.key]);
  const hasRightAxis = visibleSeries.some((s) => s.yAxisId === 'right');

  const toggleSeries = (key: string) => {
    setHiddenSeriesKeys((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleExportPng = async () => {
    setExportingPng(true);
    try {
      await exportChartContainerToPng(chartContainerRef.current, artifact);
    } catch (e) {
      console.error('Export PNG failed:', e);
    } finally {
      setExportingPng(false);
    }
  };

  const isZoomed =
    brushRange.startIndex > 0 || brushRange.endIndex < Math.max(0, data.length - 1);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
      {/* Interactive Chart Control Bar */}
      <div className="px-3.5 py-2.5 bg-slate-50/90 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap">
        {/* Left: Chart Type Selector */}
        <div className="flex items-center gap-1 flex-wrap">
          {(
            [
              { id: 'bar', label: 'Cột', icon: BarChart3 },
              { id: 'composed', label: 'Kết hợp', icon: Layers },
              { id: 'line', label: 'Đường', icon: LineChartIcon },
              { id: 'area', label: 'Vùng', icon: SlidersHorizontal },
              { id: 'pie', label: 'Tròn', icon: PieChartIcon },
            ] as Array<{ id: AIChartType; label: string; icon: any }>
          ).map((item) => {
            const Icon = item.icon;
            const active = chartType === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setChartType(item.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                  active
                    ? 'bg-sky-600 text-white shadow-2xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}

          {(chartType === 'bar' || chartType === 'composed' || chartType === 'area') &&
            series.length > 1 && (
              <button
                type="button"
                onClick={() => setIsStacked((prev) => !prev)}
                className={`ml-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                  isStacked
                    ? 'bg-amber-50 border-amber-300 text-amber-800'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
                title="Chuyển đổi giữa biểu đồ xếp chồng (Stacked) và biểu đồ tách cột (Grouped)"
              >
                {isStacked ? 'Đang xếp chồng' : 'Tách cột'}
              </button>
            )}
        </div>

        {/* Right: Export Image & Excel */}
        <div className="flex items-center gap-1.5">
          {isZoomed && (
            <button
              type="button"
              onClick={() =>
                setBrushRange({ startIndex: 0, endIndex: Math.max(0, data.length - 1) })
              }
              className="px-2 py-1 rounded-lg border border-sky-200 bg-sky-50 text-sky-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
              title="Khôi phục toàn bộ khoảng dữ liệu trên biểu đồ"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset Zoom</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportPng}
            disabled={exportingPng}
            className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            title="Xuất biểu đồ hiện tại thành file ảnh PNG độ phân giải cao"
          >
            <ImageDown className="h-3.5 w-3.5 text-sky-600" />
            <span>{exportingPng ? 'Đang xuất...' : 'Xuất Ảnh (.png)'}</span>
          </button>

          <button
            type="button"
            onClick={() => exportArtifactToExcel(artifact)}
            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Xuất dữ liệu biểu đồ và bảng chi tiết thành file Excel (.xlsx)"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>Xuất Excel</span>
          </button>
        </div>
      </div>

      {/* Series Filter Pills & Dynamic Brush Summary */}
      <div className="px-3.5 py-2 bg-white border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
            <Eye className="h-3 w-3" /> Chỉ số (bấm để ẩn/hiện):
          </span>
          {series.map((s) => {
            const hidden = Boolean(hiddenSeriesKeys[s.key]);
            const totalObj = sliceTotals.find((t) => t.key === s.key);
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => toggleSeries(s.key)}
                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border flex items-center gap-1.5 transition-all cursor-pointer ${
                  hidden
                    ? 'bg-slate-100 text-slate-400 border-slate-200 line-through opacity-60'
                    : 'bg-slate-50 text-slate-800 border-slate-200 hover:border-slate-300'
                }`}
              >
                <span
                  className="h-2.5 w-2.5 rounded-xs shrink-0"
                  style={{ backgroundColor: s.color }}
                />
                <span>{s.name}:</span>
                <span className="font-mono font-bold text-slate-900">
                  {totalObj ? totalObj.sum.toLocaleString('vi-VN') : 0}
                </span>
              </button>
            );
          })}
        </div>

        <span className="text-[11px] text-slate-500">
          Đang hiển thị:{' '}
          <b className="text-sky-700">
            {activeSliceData.length}/{data.length}
          </b>{' '}
          mốc dữ liệu (Kéo thanh trượt dưới biểu đồ để lọc vùng)
        </span>
      </div>

      {/* Main Recharts Canvas */}
      <div ref={chartContainerRef} className="p-3 bg-white">
        <div style={{ width: '100%', height }}>
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'pie' ? (
              <PieChart>
                <Pie
                  data={activeSliceData}
                  dataKey={visibleSeries[0]?.key || series[0]?.key || 'value'}
                  nameKey={xAxisKey}
                  cx="50%"
                  cy="50%"
                  outerRadius={Math.min(height * 0.34, 115)}
                  innerRadius={Math.min(height * 0.16, 52)}
                  paddingAngle={2}
                  label={({ name, percent }) =>
                    `${name}: ${((percent || 0) * 100).toFixed(1)}%`
                  }
                  onClick={(entry) => setSelectedPoint(entry?.payload || entry)}
                >
                  {activeSliceData.map((_, idx) => (
                    <Cell
                      key={`cell_${idx}`}
                      fill={PIE_COLORS[idx % PIE_COLORS.length]}
                    />
                  ))}
                </Pie>
                <RechartsTooltip
                  formatter={(value: any) =>
                    typeof value === 'number' ? value.toLocaleString('vi-VN') : value
                  }
                />
                <Legend />
              </PieChart>
            ) : chartType === 'line' ? (
              <LineChart
                data={data}
                margin={{ top: 10, right: 24, left: 8, bottom: 10 }}
                onClick={(state: any) => {
                  if (state?.activePayload?.[0]?.payload) {
                    setSelectedPoint(state.activePayload[0].payload);
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey={xAxisKey}
                  tick={{ fontSize: 11, fill: '#475569' }}
                />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#475569' }} />
                {hasRightAxis && (
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 11, fill: '#059669' }}
                  />
                )}
                <RechartsTooltip
                  contentStyle={{
                    borderRadius: '10px',
                    borderColor: '#cbd5e1',
                    fontSize: '12px',
                  }}
                  formatter={(value: any) =>
                    typeof value === 'number' ? value.toLocaleString('vi-VN') : value
                  }
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                {visibleSeries.map((s) => (
                  <Line
                    key={s.key}
                    yAxisId={s.yAxisId || 'left'}
                    type="monotone"
                    dataKey={s.key}
                    name={s.name}
                    stroke={s.color}
                    strokeWidth={2.5}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                ))}
                {data.length > 3 && (
                  <Brush
                    dataKey={xAxisKey}
                    height={24}
                    stroke="#0284c7"
                    startIndex={brushRange.startIndex}
                    endIndex={brushRange.endIndex}
                    onChange={(range: any) => {
                      if (
                        typeof range?.startIndex === 'number' &&
                        typeof range?.endIndex === 'number'
                      ) {
                        setBrushRange({
                          startIndex: range.startIndex,
                          endIndex: range.endIndex,
                        });
                      }
                    }}
                  />
                )}
              </LineChart>
            ) : chartType === 'area' ? (
              <AreaChart
                data={data}
                margin={{ top: 10, right: 24, left: 8, bottom: 10 }}
                onClick={(state: any) => {
                  if (state?.activePayload?.[0]?.payload) {
                    setSelectedPoint(state.activePayload[0].payload);
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey={xAxisKey}
                  tick={{ fontSize: 11, fill: '#475569' }}
                />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#475569' }} />
                {hasRightAxis && (
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 11, fill: '#059669' }}
                  />
                )}
                <RechartsTooltip
                  contentStyle={{
                    borderRadius: '10px',
                    borderColor: '#cbd5e1',
                    fontSize: '12px',
                  }}
                  formatter={(value: any) =>
                    typeof value === 'number' ? value.toLocaleString('vi-VN') : value
                  }
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                {visibleSeries.map((s) => (
                  <Area
                    key={s.key}
                    yAxisId={s.yAxisId || 'left'}
                    type="monotone"
                    dataKey={s.key}
                    name={s.name}
                    stroke={s.color}
                    fill={s.color}
                    fillOpacity={0.25}
                    stackId={isStacked ? 'stack_1' : undefined}
                  />
                ))}
                {data.length > 3 && (
                  <Brush
                    dataKey={xAxisKey}
                    height={24}
                    stroke="#0284c7"
                    startIndex={brushRange.startIndex}
                    endIndex={brushRange.endIndex}
                    onChange={(range: any) => {
                      if (
                        typeof range?.startIndex === 'number' &&
                        typeof range?.endIndex === 'number'
                      ) {
                        setBrushRange({
                          startIndex: range.startIndex,
                          endIndex: range.endIndex,
                        });
                      }
                    }}
                  />
                )}
              </AreaChart>
            ) : chartType === 'bar' ? (
              <BarChart
                data={data}
                margin={{ top: 10, right: 24, left: 8, bottom: 10 }}
                onClick={(state: any) => {
                  if (state?.activePayload?.[0]?.payload) {
                    setSelectedPoint(state.activePayload[0].payload);
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey={xAxisKey}
                  tick={{ fontSize: 11, fill: '#475569' }}
                />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#475569' }} />
                {hasRightAxis && (
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 11, fill: '#059669' }}
                  />
                )}
                <RechartsTooltip
                  contentStyle={{
                    borderRadius: '10px',
                    borderColor: '#cbd5e1',
                    fontSize: '12px',
                  }}
                  formatter={(value: any) =>
                    typeof value === 'number' ? value.toLocaleString('vi-VN') : value
                  }
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                {visibleSeries.map((s) => (
                  <Bar
                    key={s.key}
                    yAxisId={s.yAxisId || 'left'}
                    dataKey={s.key}
                    name={s.name}
                    fill={s.color}
                    stackId={isStacked ? 'stack_1' : undefined}
                    radius={isStacked ? [0, 0, 0, 0] : [4, 4, 0, 0]}
                  />
                ))}
                {data.length > 3 && (
                  <Brush
                    dataKey={xAxisKey}
                    height={24}
                    stroke="#0284c7"
                    startIndex={brushRange.startIndex}
                    endIndex={brushRange.endIndex}
                    onChange={(range: any) => {
                      if (
                        typeof range?.startIndex === 'number' &&
                        typeof range?.endIndex === 'number'
                      ) {
                        setBrushRange({
                          startIndex: range.startIndex,
                          endIndex: range.endIndex,
                        });
                      }
                    }}
                  />
                )}
              </BarChart>
            ) : (
              <ComposedChart
                data={data}
                margin={{ top: 10, right: 24, left: 8, bottom: 10 }}
                onClick={(state: any) => {
                  if (state?.activePayload?.[0]?.payload) {
                    setSelectedPoint(state.activePayload[0].payload);
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey={xAxisKey}
                  tick={{ fontSize: 11, fill: '#475569' }}
                />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#475569' }} />
                {hasRightAxis && (
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 11, fill: '#059669' }}
                  />
                )}
                <RechartsTooltip
                  contentStyle={{
                    borderRadius: '10px',
                    borderColor: '#cbd5e1',
                    fontSize: '12px',
                  }}
                  formatter={(value: any) =>
                    typeof value === 'number' ? value.toLocaleString('vi-VN') : value
                  }
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                {visibleSeries.map((s) =>
                  s.type === 'line' ? (
                    <Line
                      key={s.key}
                      yAxisId={s.yAxisId || 'left'}
                      type="monotone"
                      dataKey={s.key}
                      name={s.name}
                      stroke={s.color}
                      strokeWidth={2.5}
                      dot={{ r: 4 }}
                    />
                  ) : s.type === 'area' ? (
                    <Area
                      key={s.key}
                      yAxisId={s.yAxisId || 'left'}
                      type="monotone"
                      dataKey={s.key}
                      name={s.name}
                      stroke={s.color}
                      fill={s.color}
                      fillOpacity={0.2}
                    />
                  ) : (
                    <Bar
                      key={s.key}
                      yAxisId={s.yAxisId || 'left'}
                      dataKey={s.key}
                      name={s.name}
                      fill={s.color}
                      stackId={isStacked ? 'stack_1' : undefined}
                      radius={isStacked ? [0, 0, 0, 0] : [4, 4, 0, 0]}
                    />
                  )
                )}
                {data.length > 3 && (
                  <Brush
                    dataKey={xAxisKey}
                    height={24}
                    stroke="#0284c7"
                    startIndex={brushRange.startIndex}
                    endIndex={brushRange.endIndex}
                    onChange={(range: any) => {
                      if (
                        typeof range?.startIndex === 'number' &&
                        typeof range?.endIndex === 'number'
                      ) {
                        setBrushRange({
                          startIndex: range.startIndex,
                          endIndex: range.endIndex,
                        });
                      }
                    }}
                  />
                )}
              </ComposedChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* Selected Data Point Inspector */}
      {selectedPoint && (
        <div className="px-3.5 py-2.5 bg-sky-50/80 border-t border-sky-200 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-bold text-sky-900">
              Chi tiết điểm đang chọn [{selectedPoint[xAxisKey]}]:
            </span>
            {series.map((s) => (
              <span key={s.key} className="text-slate-700">
                {s.name}:{' '}
                <b className="font-mono text-slate-900">
                  {typeof selectedPoint[s.key] === 'number'
                    ? selectedPoint[s.key].toLocaleString('vi-VN')
                    : selectedPoint[s.key] ?? '—'}
                </b>
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setSelectedPoint(null)}
            className="text-[11px] text-sky-700 hover:underline font-medium cursor-pointer"
          >
            Đóng
          </button>
        </div>
      )}
    </div>
  );
};
