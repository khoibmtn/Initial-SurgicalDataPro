import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractTimeConstraintsFromPrompt,
  compute24hDutyShiftWindow,
  executeSurgeryListReportTool,
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
import {
  evaluateWithJevSystemOne,
  recordRLCDUserFeedback,
  clearLocalRLCDMemory,
} from '../services/ai/jevSystemOneEngine';
import {
  createEmptyDshWorkingMemory,
  updateDshWorkingMemory,
  buildDshWorkingMemoryPromptBlock,
  applyDshSpillPolicy,
  compactSessionHistoryForDeepSeek,
  buildDeepSeekHarnessMessages,
  applyDshOutputGuard,
} from '../services/ai/deepseekHarnessEngine';
import { reportService } from '../services/reportService';
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

describe('Jev System One Decision Engine & RLCD Reinforcement Learning', () => {
  beforeEach(() => {
    clearLocalRLCDMemory();
  });

  it('evaluates overtime questions into Choice<overtime_audit> with high confidence and recommends fast_system1', () => {
    const evalRes = evaluateWithJevSystemOne(
      'Trong danh sách các ca mổ hôm qua, những ai phải chấm ngoài giờ, từ giờ nào đến giờ nào?',
      { hasLoadedRecords: true }
    );
    expect(evalRes.intentChoice.selected).toBe('overtime_audit');
    expect(evalRes.intentChoice.calibratedProbability).toBeGreaterThan(0.65);
    expect(evalRes.nouls.isDirectTableLookup.value).toBe(true);
    expect(evalRes.recommendedMode).toBe('fast_system1');
    expect(evalRes.scores.calibrationConfidence.score).toBeGreaterThanOrEqual(82);
  });

  it('routes overtime query in statistics_studio strictly to 1 Overtime artifact without unrelated monthly/specialty charts', async () => {
    const overtimeSurgery: SurgeryRecord = {
      ...sampleSurgeries[0],
      patientId: 'BN_OT_STUDIO',
      patientName: 'Ngô Văn Trực',
      ngayBD: '2026-06-15 18:15',
      ngayKT: '2026-06-15 19:45',
      timeMinutes: 90,
      ptChinh: 'BS. Nguyễn Minh Khoa',
      ptPhu: 'BS. Trần Thanh Hải',
      bsGM: 'BS. Lê Văn Tâm',
      ktvGM: 'KTV. Hoàng Hoa',
      tdc: 'ĐD. Vũ Thị Mai',
      gv: 'ĐD. Phạm Lan',
      start: undefined,
      end: undefined,
    };

    const studioCtx: AIDataContextInput = {
      ...baseContext,
      contextPage: 'statistics_studio', // Previously caused 2 extra multi-dimensional pivot artifacts!
      currentRecords: [overtimeSurgery],
    };

    const out = await runRelationalQueryPipeline(
      'Trong danh sách các ca mổ ngày 15/06/2026, những ai phải chấm ngoài giờ?',
      studioCtx
    );

    expect(out.systemOneEval).toBeDefined();
    expect(out.systemOneEval?.intentChoice.selected).toBe('overtime_audit');
    expect(out.executedTools.map((t) => t.toolName)).toContain('analyze_overtime_records');
    expect(out.executedTools.map((t) => t.toolName)).not.toContain('multi_dimensional_pivot');
    expect(out.artifacts.length).toBe(1);
    expect(out.artifacts[0].title).toContain('Chấm Ngoài Giờ');
    expect(out.focusedFastSummary).toContain('BS. Trần Thanh Hải');
  });

  it('learns from RLCD negative feedback with correctedIntent and shifts future routing immediately', async () => {
    const ambiguousPrompt = 'Kiểm tra danh sách ка trực và đối chiếu lịch';
    const initialEval = evaluateWithJevSystemOne(ambiguousPrompt, { hasLoadedRecords: true });

    // User teaches AI via RLCD that this prompt should be 'conflict_quality'
    await recordRLCDUserFeedback({
      prompt: ambiguousPrompt,
      predictedIntent: initialEval.intentChoice.selected,
      rating: 'negative',
      correctedIntent: 'conflict_quality',
      preferredMode: 'fast_system1',
      focusNote: 'Câu này tôi muốn kiểm tra trùng lịch mổ',
    });

    const learnedEval = evaluateWithJevSystemOne(ambiguousPrompt, { hasLoadedRecords: true });
    expect(learnedEval.intentChoice.selected).toBe('conflict_quality');
    expect(learnedEval.matchedExemplarId).toBeDefined();
    expect(learnedEval.nouls.matchesLearnedPattern.value).toBe(true);
  });

  it('parses "từ đầu tháng tới giờ mổ bao nhiêu ca? Cơ cấu loại phẫu thuật thế nào?" and fetches full month from Firestore even on daily_storage', async () => {
    const prompt = 'từ đầu tháng tới giờ mổ bao nhiêu ca? Cơ cấu loại phẫu thuật thế nào?';
    const now = new Date();
    const curMonth = now.getMonth() + 1;
    const curYear = now.getFullYear();

    const tc = extractTimeConstraintsFromPrompt(prompt);
    expect(tc.months).toContain(curMonth);
    expect(tc.years).toContain(curYear);
    expect(tc.dateRange).toBeDefined();
    expect(tc.dateRange?.from).toBe(
      `${curYear}-${String(curMonth).padStart(2, '0')}-01`
    );

    const evalRes = evaluateWithJevSystemOne(prompt, { hasLoadedRecords: true });
    expect(evalRes.intentChoice.selected).toBe('general_summary');
    expect(evalRes.scores.calibrationConfidence.score).toBeGreaterThanOrEqual(85);

    // Mock Firestore reports returning earlier days in the current month (reportService.getReports returns PersistedSurgeryRecord[])
    vi.mocked(reportService.getReports).mockImplementation(async (_from, _to, type) => {
      if (type === 'DAILY') {
        return [
          {
            ...sampleSurgeries[0],
            patientId: 'BN_DAY05_A',
            ngayBD: `${curYear}-${String(curMonth).padStart(2, '0')}-05 08:30`,
            loaiPTTT: 'PĐB',
          },
          {
            ...sampleSurgeries[1],
            patientId: 'BN_DAY05_B',
            ngayBD: `${curYear}-${String(curMonth).padStart(2, '0')}-05 10:30`,
            loaiPTTT: 'P1',
          },
        ] as any;
      }
      return [];
    });

    const dailyScreenRecord: SurgeryRecord = {
      ...sampleSurgeries[2],
      patientId: 'BN_DAY19_SCREEN',
      ngayBD: `${curYear}-${String(curMonth).padStart(2, '0')}-19 09:00`,
      loaiPTTT: 'P2',
    };

    const dailyCtx: AIDataContextInput = {
      ...baseContext,
      contextPage: 'daily_storage',
      currentRecords: [dailyScreenRecord],
      allowRemoteFirestoreFetch: true,
    };

    const out = await runRelationalQueryPipeline(prompt, dailyCtx);
    expect(out.needsClarification).toBeFalsy();
    // Should include both the 2 Firestore records from day 05 AND the 1 screen record from day 19 = 3 records
    expect(out.focusedFastSummary).toContain('3 ca');
  });

  it('applies DeepSeek Harness (dsh) spill, compaction, prefix-cache message builder, and output guard', () => {
    const spillRes = applyDshSpillPolicy('Dữ liệu ngắn gọn 100 ca', 2800);
    expect(spillRes.spilled).toBe(false);

    const compacted = compactSessionHistoryForDeepSeek([
      {
        id: 'u1',
        role: 'user',
        content: 'Tháng này mổ bao nhiêu ca?',
        timestamp: Date.now() - 2000,
      },
      {
        id: 'a1',
        role: 'assistant',
        content:
          '<think>Suy nghĩ nội bộ dài...</think>\nTổng số ca: 120 ca.\n| Loại | Số ca |\n| --- | --- |\n| P1 | 50 |\n| P2 | 70 |\n| P3 | 0 |\n| PĐB | 0 |',
        timestamp: Date.now() - 1000,
      },
    ]);
    expect(compacted[1].content).not.toContain('<think>');
    expect(compacted[1].content).not.toContain('| P1 | 50 |');
    expect(compacted[1].content).toContain('Tổng số ca: 120 ca.');

    const dshMsgs = buildDeepSeekHarnessMessages({
      staticSystemPrompt: 'SYSTEM_STATIC_SCHEMA',
      dynamicTurnContextPrompt: 'DYNAMIC_TURN_DATA',
      compactedHistory: compacted,
      userQuestion: 'Cơ cấu loại phẫu thuật?',
      spilledToolContext: 'Tổng số 120 ca',
      dataSourceCitation: 'Tháng 10/2026',
    });
    // First message is byte-for-byte static system prompt for 100% DeepSeek Prefix Cache hit
    expect(dshMsgs[0].role).toBe('system');
    expect(dshMsgs[0].content).toBe('SYSTEM_STATIC_SCHEMA');

    // Guard catches false "missing ngayBD/ngayKT" hallucination when records exist
    const guarded = applyDshOutputGuard(
      'Dữ liệu hiện tại không chứa các trường dữ liệu bắt buộc ngayBD, ngayKT nên chưa thể xác định danh sách nhân sự chấm ngoài giờ.',
      'Báo cáo chính xác từ 25 ca PTTT.',
      25
    );
    expect(guarded.guardTriggered).toBe(true);
    expect(guarded.finalContent).toContain('Báo cáo chính xác từ 25 ca PTTT');
  });

  it('resolves "báo cáo danh sách phẫu thuật trong tua trực ngày hôm qua" using official 24h duty shift window (07:00/07:30 -> 06:59/07:29 next morning) and outputs concise surgery list without unrelated duty schedule or charts', async () => {
    // 1. Verify Winter (20/10/2026: 07:30 -> 21/10/2026 07:29) and Summer (15/06/2026: 07:00 -> 16/06/2026 06:59) 24h duty shift windows
    const winterShift = compute24hDutyShiftWindow('2026-10-20', '2026-10-20', DEFAULT_CONFIG.workingHours);
    expect(`${winterShift.dateFromStr} ${winterShift.timeFrom}`).toBe('2026-10-20 07:30');
    expect(`${winterShift.dateToStr} ${winterShift.timeTo}`).toBe('2026-10-21 07:29');

    const summerShift = compute24hDutyShiftWindow('2026-06-15', '2026-06-15', DEFAULT_CONFIG.workingHours);
    expect(`${summerShift.dateFromStr} ${summerShift.timeFrom}`).toBe('2026-06-15 07:00');
    expect(`${summerShift.dateToStr} ${summerShift.timeTo}`).toBe('2026-06-16 06:59');

    // 2. Verify prompt extraction & Jev System One intent classification
    const prompt = 'báo cáo danh sách phẫu thuật trong tua trực ngày hôm qua';
    const tc = extractTimeConstraintsFromPrompt(prompt);
    expect(tc.isDutyShift24h).toBe(true);
    expect(tc.specificDates.length).toBe(1);
    const yesterdayIso = tc.specificDates[0];

    const evalRes = evaluateWithJevSystemOne(prompt, { hasLoadedRecords: true });
    expect(evalRes.intentChoice.selected).toBe('general_summary');
    expect(evalRes.recommendedMode).toBe('fast_system1');

    // 3. Verify 24h shift filtering includes overnight surgery at 02:15 next morning and excludes 06:15 before shift start
    const shiftWin = compute24hDutyShiftWindow(yesterdayIso, yesterdayIso, DEFAULT_CONFIG.workingHours);
    const nextDayIso = shiftWin.dateToStr;

    vi.mocked(reportService.getReports).mockImplementation(async (_from, _to, type) => {
      if (type === 'DAILY') {
        return [
          {
            ...sampleSurgeries[0],
            patientId: 'BN_BEFORE_SHIFT',
            patientName: 'Trần Trước Ca Trực',
            ngayBD: `${yesterdayIso} 06:10`,
            ngayKT: `${yesterdayIso} 06:50`,
            tenKT: 'Phẫu thuật trước giờ giao ban (thuộc tua trực hôm kia)',
            loaiPTTT: 'P2',
          },
          {
            ...sampleSurgeries[0],
            patientId: 'BN_IN_SHIFT_1',
            patientName: 'Nguyễn Ca Trực Tối',
            ngayBD: `${yesterdayIso} 21:30`,
            ngayKT: `${yesterdayIso} 22:45`,
            tenKT: 'Phẫu thuật nội soi cắt ruột thừa viêm',
            loaiPTTT: 'P2',
            ptChinh: 'BS. Nguyễn Minh Khoa',
            bsGM: 'BS. Lê Văn Tâm',
          },
          {
            ...sampleSurgeries[1],
            patientId: 'BN_IN_SHIFT_2_OVERNIGHT',
            patientName: 'Lê Ca Trực Rạng Sáng',
            ngayBD: `${nextDayIso} 02:15`,
            ngayKT: `${nextDayIso} 03:20`,
            tenKT: 'Phẫu thuật lấy thai cấp cứu',
            loaiPTTT: 'P1',
            ptChinh: 'BS. Trần Thị Lan',
            bsGM: 'BS. Lê Văn Tâm',
          },
        ] as any;
      }
      return [];
    });

    const out = await runRelationalQueryPipeline(prompt, {
      ...baseContext,
      contextPage: 'daily_storage',
      currentRecords: [],
      allowRemoteFirestoreFetch: true,
    });

    // Must include only the 2 surgeries inside the 24h shift window (21:30 yesterday & 02:15 next morning)
    expect(out.scopedRecordCount).toBe(2);
    expect(out.dataSourceCitation).toContain('Tua trực 24h ngày');
    expect(out.executedTools.map((t) => t.toolName)).toContain('report_surgery_list');
    // Must NOT run unrelated duty schedule roster or multi-dimensional pivot
    expect(out.executedTools.map((t) => t.toolName)).not.toContain('analyze_duty_schedule');
    expect(out.executedTools.map((t) => t.toolName)).not.toContain('multi_dimensional_pivot');
    // Must have 1 table artifact with NO chartConfig
    expect(out.artifacts.length).toBe(1);
    expect(out.artifacts[0].type).toBe('table');
    expect(out.artifacts[0].chartConfig).toBeUndefined();
    expect(out.focusedFastSummary).toContain('Nguyễn Ca Trực Tối');
    expect(out.focusedFastSummary).toContain('Lê Ca Trực Rạng Sáng');
    expect(out.focusedFastSummary).not.toContain('Trần Trước Ca Trực');
  });

  it('maintains multi-turn conversational context across follow-up questions ("danh sách bệnh nhân phẫu thuật trong ngày hôm qua" -> "phân tích cơ cấu phẫu thuật trong danh sách đó") even when screen has no opened records', async () => {
    const turn1Prompt = 'danh sách bệnh nhân phẫu thuật trong ngày hôm qua';
    const tc1 = extractTimeConstraintsFromPrompt(turn1Prompt);
    const yesterdayIso = tc1.specificDates[0];

    vi.mocked(reportService.getReports).mockImplementation(async (_from, _to, type) => {
      if (type === 'DAILY') {
        return [
          {
            ...sampleSurgeries[0],
            patientId: '2600166934',
            patientName: 'ĐỖ THỊ TRANG',
            ngayBD: `${yesterdayIso} 08:00`,
            ngayKT: `${yesterdayIso} 10:00`,
            tenKT: 'Phẫu thuật nội soi u nang buồng trứng',
            loaiPTTT: 'P1',
            ptChinh: 'BS. Trần Thị Lan',
          },
          {
            ...sampleSurgeries[1],
            patientId: '2600166582',
            patientName: 'ĐỖ THỊ PHƯỚC',
            ngayBD: `${yesterdayIso} 10:15`,
            ngayKT: `${yesterdayIso} 11:15`,
            tenKT: 'Phẫu thuật mộng thịt ghép kết mạc tự thân',
            loaiPTTT: 'P2',
            ptChinh: 'BS. Nguyễn Minh Khoa',
          },
        ] as any;
      }
      return [];
    });

    const emptyStudioCtx: AIDataContextInput = {
      ...baseContext,
      contextPage: 'statistics_studio',
      currentRecords: [], // No data opened on screen!
      allowRemoteFirestoreFetch: true,
    };

    // Turn 1: Ask for surgery patient list yesterday
    const turn1Out = await runRelationalQueryPipeline(turn1Prompt, emptyStudioCtx);
    expect(turn1Out.needsClarification).toBeFalsy();
    expect(turn1Out.scopedRecordCount).toBe(2);
    expect(turn1Out.executedTools.map((t) => t.toolName)).toContain('report_surgery_list');
    expect(turn1Out.focusedFastSummary).toContain('ĐỖ THỊ TRANG');
    expect(turn1Out.turnScope).toBeDefined();

    // Turn 2: Follow-up question "phân tích cơ cấu phẫu thuật trong danh sách đó" without repeating the date
    const turn2Prompt = 'phân tích cơ cấu phẫu thuật trong danh sách đó';
    const turn2Out = await runRelationalQueryPipeline(turn2Prompt, emptyStudioCtx, {
      recentUserPrompts: [turn1Prompt],
      previousTurnScope: turn1Out.turnScope,
    });

    // Must NOT ask for clarification; must inherit the 2 records from Turn 1 and analyze structure!
    expect(turn2Out.needsClarification).toBeFalsy();
    expect(turn2Out.scopedRecordCount).toBe(2);
    expect(turn2Out.dataSourceCitation).toContain('tiếp nối ngữ cảnh câu trước');
    expect(turn2Out.executedTools.map((t) => t.toolName)).toContain('multi_dimensional_pivot');
    expect(turn2Out.executedTools.map((t) => t.toolName)).not.toContain('report_surgery_list');
    expect(turn2Out.focusedFastSummary).toContain('Cơ cấu Phân loại PTTT');
    expect(turn2Out.focusedFastSummary).toContain('P1: **1** ca');
    expect(turn2Out.focusedFastSummary).toContain('P2: **1** ca');

    // Update DeepSeek Harness Working Memory across Turn 1 and Turn 2
    let dshMem = createEmptyDshWorkingMemory('statistics_studio');
    dshMem = updateDshWorkingMemory(dshMem, 'statistics_studio', {
      userPrompt: turn1Prompt,
      turnScope: turn1Out.turnScope,
      focusedSummaryText: turn1Out.focusedFastSummary,
    });
    dshMem = updateDshWorkingMemory(dshMem, 'statistics_studio', {
      userPrompt: turn2Prompt,
      turnScope: turn2Out.turnScope,
      focusedSummaryText: turn2Out.focusedFastSummary,
    });
    expect(dshMem.anchoredTimeScope?.recordCount).toBe(2);
    expect(dshMem.activeEntities.patientDigest.length).toBe(2);
    expect(dshMem.turnLedger.length).toBe(2);

    // Turn 3: Sub-scope filtering ("chi tiết các ca P1 trong đó")
    const turn3Prompt = 'chi tiết các ca P1 trong đó';
    const turn3Out = await runRelationalQueryPipeline(turn3Prompt, emptyStudioCtx, {
      recentUserPrompts: [turn1Prompt, turn2Prompt],
      previousTurnScope: turn2Out.turnScope,
      workingMemory: dshMem,
    });
    expect(turn3Out.scopedRecordCount).toBe(1);
    expect(turn3Out.focusedFastSummary).toContain('ĐỖ THỊ TRANG');
    expect(turn3Out.focusedFastSummary).not.toContain('ĐỖ THỊ PHƯỚC');

    // Turn 4: Sibling sub-scope follow-up ("còn các ca P2 thì sao?")
    // Must restore from unfilteredScopedRecords (parent scope of 2 records) instead of getting stuck in Turn 3's P1 subset!
    const turn4Prompt = 'còn các ca P2 thì sao?';
    const turn4Out = await runRelationalQueryPipeline(turn4Prompt, emptyStudioCtx, {
      recentUserPrompts: [turn1Prompt, turn2Prompt, turn3Prompt],
      previousTurnScope: turn3Out.turnScope,
      workingMemory: dshMem,
    });
    expect(turn4Out.scopedRecordCount).toBe(1);
    expect(turn4Out.focusedFastSummary).toContain('ĐỖ THỊ PHƯỚC');
    expect(turn4Out.focusedFastSummary).not.toContain('ĐỖ THỊ TRANG');

    // Turn 5: Ordinal row lookup ("ca thứ 1 do ai mổ chính?") & Cross-reload Working Memory recovery (when previousTurnScope is null)
    const turn5Prompt = 'ca thứ 1 trong danh sách đó do ai mổ chính?';
    const turn5Out = await runRelationalQueryPipeline(turn5Prompt, emptyStudioCtx, {
      recentUserPrompts: [turn1Prompt, turn2Prompt],
      previousTurnScope: null, // Simulate page reload where in-memory ref is wiped!
      workingMemory: dshMem,   // Recovered from localStorage DshSessionWorkingMemory!
    });
    expect(turn5Out.needsClarification).toBeFalsy();
    expect(turn5Out.scopedRecordCount).toBe(2);
    expect(turn5Out.focusedFastSummary).toContain('ĐỖ THỊ TRANG');
    expect(turn5Out.focusedFastSummary).toContain('BS. Trần Thị Lan');
  });

  it('builds Two-Tier Rolling Compaction with [DSH_COMPACTION_SUMMARY_NODE] and injects DSH Working Memory block in-history', () => {
    const longHistory = [
      { id: 'u1', role: 'user' as const, content: 'Danh sách phẫu thuật ngày hôm qua', timestamp: 1000 },
      { id: 'a1', role: 'assistant' as const, content: '📋 **DANH SÁCH PHẪU THUẬT (2 ca)**\n| STT | Họ tên |\n| --- | --- |\n| 1 | ĐỖ THỊ TRANG |\n| 2 | ĐỖ THỊ PHƯỚC |', timestamp: 2000 },
      { id: 'u2', role: 'user' as const, content: 'Phân tích cơ cấu phẫu thuật trong đó', timestamp: 3000 },
      { id: 'a2', role: 'assistant' as const, content: '📊 **Cơ cấu Phân loại PTTT**: P1: 1 ca, P2: 1 ca', timestamp: 4000 },
      { id: 'u3', role: 'user' as const, content: 'Chi tiết các ca P1 trong danh sách đó', timestamp: 5000 },
      { id: 'a3', role: 'assistant' as const, content: '📋 **DANH SÁCH CA P1 (1 ca)**\n| STT | Họ tên | PT Chính |\n| --- | --- | --- |\n| 1 | ĐỖ THỊ TRANG | BS. Trần Thị Lan |', timestamp: 6000 },
    ];

    // Keep maxMessages = 4 (2 recent turns: u2/a2, u3/a3), so u1/a1 get compacted into a [DSH_COMPACTION_SUMMARY_NODE] pair,
    // and preserve up to 12 table rows in the most recent assistant message (a3)
    const compacted = compactSessionHistoryForDeepSeek(longHistory, 4, 900, 12);
    expect(compacted.length).toBe(6); // 2 summary node msgs + 4 recent msgs
    expect(compacted[0].content).toContain('[DSH_COMPACTION_SUMMARY_NODE');
    expect(compacted[0].content).toContain('ĐỖ THỊ TRANG');
    // Most recent assistant turn (compacted[5]) preserves its markdown table rows when maxTableRowsInRecentTurn = 12
    expect(compacted[5].content).toContain('| 1 | ĐỖ THỊ TRANG | BS. Trần Thị Lan |');

    let mem = createEmptyDshWorkingMemory('daily_storage');
    mem.anchoredTimeScope = {
      dataSourceCitation: 'Tua trực 24h ngày 20/10/2026',
      scopedDateRange: '2026-10-20 -> 2026-10-20',
      recordCount: 2,
      timeConstraints: {
        years: [2026],
        months: [{ year: 2026, month: 10 }],
        specificDates: ['2026-10-20'],
        seasonHint: null,
        isCurrentMonthToDate: false,
        isDutyShift24h: true,
        isYtdComparison: false,
        isFullYear: false,
      },
      updatedAt: Date.now(),
    };
    mem.activeEntities.patientDigest = ['#1: ĐỖ THỊ TRANG (P1, PT chính: BS. Trần Thị Lan)'];

    const memBlock = buildDshWorkingMemoryPromptBlock(mem);
    expect(memBlock).toContain('SỔ CÁI BỘ NHỚ LÀM VIỆC PHIÊN CHAT');
    expect(memBlock).toContain('Tua trực 24h ngày 20/10/2026');
    expect(memBlock).toContain('ĐỖ THỊ TRANG');
  });
});
