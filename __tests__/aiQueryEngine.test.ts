import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractTimeConstraintsFromPrompt,
  executePatientSearchTool,
  executeStaffWorkloadTool,
  executeServicePackageAnalysisTool,
  executeDutyScheduleAnalysisTool,
  executeOvertimeAnalysisTool,
  executeConflictAndQualityTool,
  executeMultiDimensionalPivotTool,
  runRelationalQueryPipeline,
  type AIDataContextInput,
} from '../services/ai/aiQueryEngine';
import {
  DEFAULT_AI_SYSTEM_CONFIG,
  normalizeAISystemConfig,
  getEffectiveProviderConfig,
  getEffectiveSlotConfig,
  savePersonalAIOverride,
  loadPersonalAIOverride,
  updatePersonalSlotOverride,
  clearAIStorageCache,
  maskApiKeyPreview,
} from '../services/ai/aiConfigService';
import type { SurgeryRecord, DutyScheduleDateConfig } from '../types';
import type { ServicePackageAssignment, ServicePackageDefinition } from '../types/servicePackage';
import { DEFAULT_CONFIG } from '../contexts/ConfigContext';

// Mock Firebase-dependent services so tests run fast and deterministically offline
vi.mock('../services/reportService', () => ({
  reportService: {
    getReports: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../services/dutyScheduleService', () => ({
  dutyScheduleService: {
    getDutySchedulesForDates: vi.fn().mockResolvedValue({}),
  },
  isWeekend: (dateKey: string) => {
    const d = new Date(`${dateKey}T00:00:00`);
    const day = d.getDay();
    return day === 0 || day === 6;
  },
  formatDateKey: (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },
}));

const sampleSurgeries: SurgeryRecord[] = [
  {
    stt: 1,
    patientId: 'BN00123',
    patientName: 'Nguyễn Văn An',
    yob: '1980',
    gender: 'Nam',
    bhyt: 'DN401001',
    ngayCD: '2026-06-15 08:00',
    ngayBD: '2026-06-15 08:30',
    ngayKT: '2026-06-15 09:45',
    timeMinutes: 75,
    tenKT: 'Phẫu thuật nội soi cắt ruột thừa viêm',
    soLuong: 1,
    loaiPTTT: 'P1',
    ptChinh: 'BS. Nguyễn Minh Khoa',
    ptPhu: 'BS. Trần Thanh Hải',
    bsGM: 'BS. Lê Văn Tâm',
    ktvGM: 'KTV. Hoàng Hoa',
    tdc: '',
    gv: 'ĐD. Phạm Lan',
    machine: 'MN01',
    machineCode: 'MN01',
    machineId: 'M1',
    start: new Date('2026-06-15T08:30:00'),
    end: new Date('2026-06-15T09:45:00'),
    thanhTien: 3500000,
  },
  {
    stt: 2,
    patientId: 'BN00456',
    patientName: 'Trần Thị Bình',
    yob: '1992',
    gender: 'Nữ',
    bhyt: 'GD401002',
    ngayCD: '2026-11-20 10:00',
    ngayBD: '2026-11-20 10:15',
    ngayKT: '2026-11-20 11:30',
    timeMinutes: 75,
    tenKT: 'Phẫu thuật nội soi cắt túi mật do sỏi',
    soLuong: 1,
    loaiPTTT: 'P1',
    ptChinh: 'BS. Nguyễn Minh Khoa',
    ptPhu: 'BS. Vũ Quốc Tuấn',
    bsGM: 'BS. Lê Văn Tâm',
    ktvGM: 'KTV. Hoàng Hoa',
    tdc: '',
    gv: 'ĐD. Phạm Lan',
    machine: 'MN01',
    machineCode: 'MN01',
    machineId: 'M1',
    start: new Date('2026-11-20T10:15:00'),
    end: new Date('2026-11-20T11:30:00'),
    thanhTien: 4200000,
  },
  {
    stt: 3,
    patientId: 'BN00789',
    patientName: 'Lê Thị Cẩm',
    yob: '1995',
    gender: 'Nữ',
    bhyt: 'HT301009',
    ngayCD: '2026-06-18 14:00',
    ngayBD: '2026-06-18 14:20',
    ngayKT: '2026-06-18 15:10',
    timeMinutes: 50,
    tenKT: 'Phẫu thuật lấy thai lần đầu',
    soLuong: 1,
    loaiPTTT: 'P2',
    ptChinh: 'BS. Trần Thanh Hải',
    ptPhu: 'BS. Nguyễn Minh Khoa',
    bsGM: 'BS. Lê Văn Tâm',
    ktvGM: 'KTV. Hoàng Hoa',
    tdc: '',
    gv: 'ĐD. Phạm Lan',
    machine: '',
    machineCode: '',
    machineId: '',
    start: new Date('2026-06-18T14:20:00'),
    end: new Date('2026-06-18T15:10:00'),
    thanhTien: 2800000,
  },
];

const samplePackages: ServicePackageDefinition[] = [
  {
    id: 'pkg_san_01',
    name: 'Gói dịch vụ yêu cầu Sản khoa VIP 1',
    shortName: 'SAN_VIP1',
    totalAmount: 5000000,
    positions: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

const sampleAssignments: ServicePackageAssignment[] = [
  {
    id: 'assign_1',
    compositeKey: '2026-06-18|BN00789|phẫu thuật lấy thai lần đầu',
    patientId: 'BN00789',
    patientName: 'Lê Thị Cẩm',
    tenKT: 'Phẫu thuật lấy thai lần đầu',
    ngayBD: '2026-06-18 14:20',
    loaiPTTT: 'P2',
    packageId: 'pkg_san_01',
    packageName: 'Gói dịch vụ yêu cầu Sản khoa VIP 1',
    packageShortName: 'SAN_VIP1',
    staffAssignments: [
      {
        positionId: 'pos_1',
        positionKey: 'ptChinh',
        positionLabel: 'PTV Chính',
        staffName: 'BS. Trần Thanh Hải',
        amount: 2000000,
        autoFilled: true,
      },
    ],
    assignedAt: Date.now(),
    updatedAt: Date.now(),
  },
];

const sampleDutySchedules: Record<string, DutyScheduleDateConfig> = {
  '2026-06-15': {
    date: '2026-06-15',
    onCallStaff: ['BS. Lê Văn Tâm', 'BS. Nguyễn Minh Khoa', 'KTV. Hoàng Hoa'],
    isHoliday: false,
    updatedAt: Date.now(),
  },
  '2026-06-20': {
    date: '2026-06-20',
    onCallStaff: ['BS. Lê Văn Tâm', 'BS. Trần Thanh Hải'],
    isHoliday: true,
    updatedAt: Date.now(),
  },
};

const baseContext: AIDataContextInput = {
  contextPage: 'statistics_studio',
  periodLabel: 'Năm 2026',
  currentRecords: sampleSurgeries,
  dutySchedules: sampleDutySchedules,
  packageAssignments: sampleAssignments,
  packageDefinitions: samplePackages,
  chapters: [],
  surgeryNamePrices: [],
  config: DEFAULT_CONFIG,
  allowRemoteFirestoreFetch: false,
};

describe('AI Relational Query Engine', () => {
  beforeEach(() => {
    clearAIStorageCache();
  });

  it('finds patient records by patientId and joins service package info', () => {
    const res = executePatientSearchTool(
      sampleSurgeries,
      sampleAssignments,
      'tìm kiếm bn có mã BN00789'
    );
    expect(res.matchedRecords.length).toBe(1);
    expect(res.artifact).toBeDefined();
    const table = res.artifact!.tableConfig!;
    expect(table.rows.length).toBe(1);
    expect(table.rows[0].patientId).toBe('BN00789');
    expect(String(table.rows[0].packageName)).toContain('SAN_VIP1');
  });

  it('calculates staff workload across 6 surgical roles accurately', () => {
    const res = executeStaffWorkloadTool(baseContext, sampleSurgeries, ['BS. Nguyễn Minh Khoa']);
    expect(res.summaryText).toContain('3');
    // BS. Nguyễn Minh Khoa is ptChinh in 2 cases and ptPhu in 1 case
    expect(res.artifact).toBeDefined();
    const row = res.artifact!.tableConfig!.rows[0];
    expect(row.totalCases).toBe(3);
    expect(row.ptChinhCount).toBe(2);
    expect(row.ptPhuCount).toBe(1);
  });

  it('counts service package usage for obstetrics packages', () => {
    const res = executeServicePackageAnalysisTool(
      baseContext,
      sampleSurgeries,
      'Bao nhiêu ca sử dụng gói DV yêu cầu sản khoa?',
      [],
      [2026]
    );
    expect(res.summaryText).toContain('1 ca');
    expect(res.artifact).toBeDefined();
    expect(res.artifact!.tableConfig!.rows[0].packageName).toContain('Sản khoa VIP 1');
  });

  it('counts staff duty schedule shifts in a given month', async () => {
    const res = await executeDutyScheduleAnalysisTool(
      baseContext,
      'Tháng 6 nhân viên Lê Văn Tâm trực bao nhiêu buổi?',
      [6],
      [2026],
      ['BS. Lê Văn Tâm'],
      []
    );
    expect(res.summaryText).toContain('2 buổi trực');
    expect(res.artifact).toBeDefined();
    expect(res.artifact!.tableConfig!.rows[0].totalShifts).toBe(2);
    expect(res.artifact!.tableConfig!.rows[0].weekdayShifts).toBe(1);
    expect(res.artifact!.tableConfig!.rows[0].holidayShifts).toBe(1);
  });

  it('performs multi-dimensional pivot for endoscopic digestive surgeries across seasons, months, and surgeons', () => {
    const res = executeMultiDimensionalPivotTool(
      baseContext,
      sampleSurgeries,
      'Phân tích phẫu thuật nội soi tiêu hóa ở các tháng khác nhau, mùa khác nhau, bác sĩ khác nhau'
    );
    // Should match 2 endoscopic digestive surgeries (1 in June = Summer, 1 in November = Winter)
    expect(res.summaryText).toContain('2 ca');
    expect(res.artifacts.length).toBeGreaterThanOrEqual(2);
    const monthSeasonArtifact = res.artifacts[0];
    expect(monthSeasonArtifact.chartConfig).toBeDefined();
    expect(monthSeasonArtifact.tableConfig!.rows.length).toBe(2);
  });

  it('orchestrates compound relational queries via runRelationalQueryPipeline', async () => {
    const out = await runRelationalQueryPipeline(
      'Bao nhiêu ca sử dụng gói DV yêu cầu sản khoa và tháng 6 BS Lê Văn Tâm trực bao nhiêu buổi?',
      baseContext
    );
    expect(out.executedTools.length).toBeGreaterThanOrEqual(2);
    expect(out.artifacts.length).toBeGreaterThanOrEqual(2);
    expect(out.contextDataForLLM).toContain('Sản khoa VIP 1');
    expect(out.contextDataForLLM).toContain('2 buổi trực');
  });

  it('parses "9 tháng đầu năm 2026 so với 2025" and compares CTCH without unrequested Season/Surgeon dimensions', () => {
    const prompt = 'phân tích so sánh phẫu thuật chấn thương chỉnh hình 9 tháng đầu năm 2026 so với 2025';
    const timeConstraints = extractTimeConstraintsFromPrompt(prompt);
    expect(timeConstraints.months).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(timeConstraints.years).toEqual([2025, 2026]);

    const ctchRecords: SurgeryRecord[] = [
      {
        ...sampleSurgeries[0],
        patientId: 'CTCH_2025_1',
        ngayBD: '2025-03-10 09:00',
        start: new Date('2025-03-10T09:00:00'),
        tenKT: 'Phẫu thuật kết hợp xương đùi bằng nẹp vít',
        soLuong: 1,
        loaiPTTT: 'P1',
        thanhTien: 5000000,
      },
      {
        ...sampleSurgeries[0],
        patientId: 'CTCH_2026_1',
        ngayBD: '2026-03-12 09:00',
        start: new Date('2026-03-12T09:00:00'),
        tenKT: 'Phẫu thuật kết hợp xương đùi bằng nẹp vít',
        soLuong: 1,
        loaiPTTT: 'P1',
        thanhTien: 5000000,
      },
      {
        ...sampleSurgeries[0],
        patientId: 'CTCH_2026_2',
        ngayBD: '2026-05-18 10:00',
        start: new Date('2026-05-18T10:00:00'),
        tenKT: 'Phẫu thuật tháo phương tiện kết hợp xương',
        soLuong: 1,
        loaiPTTT: 'P2',
        thanhTien: 3000000,
      },
    ];

    const res = executeMultiDimensionalPivotTool(baseContext, ctchRecords, prompt);
    expect(res.summaryText).toContain('Chuyên khoa Chấn thương chỉnh hình (CTCH)');
    expect(res.summaryText).toContain('T1–T9 (9 tháng)/2026');
    expect(res.summaryText).toContain('T1–T9 (9 tháng)/2025');
    expect(res.summaryText).toContain('+1 ca');
    // Must NOT include unrequested Mùa Hè / Mùa Đông or Phẫu thuật viên chính sections
    expect(res.summaryText).not.toContain('Mùa Hè');
    expect(res.summaryText).not.toContain('Mùa Đông');
    expect(res.summaryText).not.toContain('Phẫu thuật viên chính');
  });

  it('asks for clarification when no data is opened on the active tab and prompt has no time period', async () => {
    const emptyCtx: AIDataContextInput = {
      ...baseContext,
      currentRecords: [],
      dailyOpenedRecords: sampleSurgeries,
      dailyOpenedCitation: 'Số liệu Báo cáo hàng ngày từ 15/06/2026 00:00 đến 15/06/2026 23:59 (3 ca)',
    };

    const out = await runRelationalQueryPipeline('Nhân viên nào mổ nhiều ca nhất?', emptyCtx);
    expect(out.needsClarification).toBe(true);
    expect(out.clarificationOptions).toBeDefined();
    expect(out.clarificationOptions!.length).toBeGreaterThanOrEqual(4);
    expect(out.clarificationOptions![0].label).toContain('Báo cáo hàng ngày đang mở');
  });

  it('resolves explicit time period and cites exact DD/MM/YYYY date range in dataSourceCitation', async () => {
    const out = await runRelationalQueryPipeline(
      'Phân tích phẫu thuật chấn thương chỉnh hình 9 tháng đầu năm 2026 so với 2025',
      baseContext
    );
    expect(out.needsClarification).toBeFalsy();
    expect(out.dataSourceCitation).toContain('01/01/2026 đến 30/09/2026');
    expect(out.dataSourceCitation).toContain('so sánh với từ 01/01/2025 đến 30/09/2025');
    expect(out.contextDataForLLM).toContain('Nguồn số liệu sử dụng:');
  });

  it('calculates overtime accurately and excludes on-call staff when asked "những ai phải chấm ngoài giờ?"', async () => {
    const overtimeSurgery: SurgeryRecord = {
      ...sampleSurgeries[0],
      patientId: 'BN_OT_01',
      patientName: 'Phạm Văn Đêm',
      ngayBD: '2026-06-15 18:00',
      ngayKT: '2026-06-15 19:30',
      timeMinutes: 90,
      tenKT: 'Phẫu thuật nội soi khâu lỗ thủng dạ dày',
      loaiPTTT: 'P1',
      // BS. Nguyễn Minh Khoa & BS. Lê Văn Tâm are in sampleDutySchedules['2026-06-15'].onCallStaff
      // BS. Trần Thanh Hải & ĐD. Vũ Thị Mai are NOT in onCallStaff -> must clock overtime!
      ptChinh: 'BS. Nguyễn Minh Khoa',
      ptPhu: 'BS. Trần Thanh Hải',
      bsGM: 'BS. Lê Văn Tâm',
      ktvGM: 'KTV. Hoàng Hoa',
      tdc: 'ĐD. Vũ Thị Mai',
      gv: 'ĐD. Phạm Lan',
      start: undefined, // Test automatic Date hydration from ngayBD/ngayKT strings!
      end: undefined,
    };

    const dailyCtx: AIDataContextInput = {
      ...baseContext,
      contextPage: 'daily_storage',
      currentRecords: [overtimeSurgery],
      dailyOpenedRecords: [overtimeSurgery], // Same record in both currentRecords & dailyOpenedRecords to test deduplication!
    };

    const out = await runRelationalQueryPipeline(
      'Trong danh sách các ca mổ ngày 15/06/2026, những ai phải chấm ngoài giờ, từ giờ nào đến giờ nào?',
      dailyCtx
    );

    // Must deduplicate so scopedRecordCount is 1 (not 2)
    expect(out.scopedRecordCount).toBe(1);
    expect(out.executedTools.some((t) => t.toolName === 'analyze_overtime_records')).toBe(true);
    expect(out.contextDataForLLM).toContain('BS. Trần Thanh Hải');
    expect(out.contextDataForLLM).toContain('ĐD. Vũ Thị Mai');
    expect(out.contextDataForLLM).toContain('18:00');
    expect(out.contextDataForLLM).toContain('19:30');
    expect(out.contextDataForLLM).toContain('90 phút');
  });

  it('detects and reports staff conflicts and missing machines via executeConflictAndQualityTool', async () => {
    const out = await runRelationalQueryPipeline(
      'Kiểm tra trùng lịch nhân viên và thiếu mã máy trong kỳ',
      baseContext
    );
    expect(out.executedTools.some((t) => t.toolName === 'analyze_conflicts_and_quality')).toBe(true);
    expect(out.contextDataForLLM).toContain('Kết quả Kiểm định Xung đột');
  });
});

describe('AI Configuration Service', () => {
  beforeEach(() => {
    clearAIStorageCache();
  });

  it('provides default configuration with 4 providers, 4 slots, and MCQ-style declaredModels', () => {
    const cfg = normalizeAISystemConfig(DEFAULT_AI_SYSTEM_CONFIG);
    expect(Object.keys(cfg.providers)).toEqual(['gemini', 'openai', 'anthropic', 'deepseek']);
    expect(cfg.providers.gemini.baseUrl).toContain('generativelanguage.googleapis.com');
    expect(cfg.providers.openai.baseUrl).toContain('api.openai.com');
    expect(cfg.providers.anthropic.baseUrl).toContain('api.anthropic.com');
    expect(cfg.providers.deepseek.baseUrl).toContain('api.deepseek.com');
    expect(Object.keys(cfg.slots)).toEqual([
      'daily_storage',
      'monthly_storage',
      'statistics_studio',
      'conflict_insight',
    ]);
    expect(cfg.declaredModels).toBeDefined();
    expect(cfg.declaredModels!.length).toBeGreaterThanOrEqual(1);
    expect(cfg.declaredModels![0].isDefault).toBe(true);
    expect(maskApiKeyPreview('AIzaSyD123456789zII')).toBe('AIzaSy••••zII');
  });

  it('applies personal override and slot override cleanly', () => {
    const cfg = normalizeAISystemConfig(DEFAULT_AI_SYSTEM_CONFIG);
    savePersonalAIOverride({
      usePersonalKeys: true,
      providerKeys: { deepseek: 'sk-personal-deepseek' },
      providerBaseUrls: {},
      slotOverrides: {},
    });
    updatePersonalSlotOverride('statistics_studio', {
      provider: 'deepseek',
      modelId: 'deepseek-reasoner',
      reasoningEffort: 'high',
      temperature: 0.1,
    });

    const personal = loadPersonalAIOverride();
    const effSlot = getEffectiveSlotConfig('statistics_studio', cfg, personal);
    const effProvider = getEffectiveProviderConfig(effSlot.provider, cfg, personal);

    expect(effSlot.provider).toBe('deepseek');
    expect(effSlot.modelId).toBe('deepseek-reasoner');
    expect(effSlot.reasoningEffort).toBe('high');
    expect(effSlot.temperature).toBe(0.1);
    expect(effProvider.apiKey).toBe('sk-personal-deepseek');
  });
});
